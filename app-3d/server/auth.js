// Login do painel: página /entrar, cookie de sessão assinado e /sair (substitui o pedido de senha do navegador).
//
// O cookie guarda só "<expira>.<assinatura>": a assinatura é um HMAC do usuário + validade com uma chave
// derivada da senha. Trocar PAINEL_SENHA (ou SESSAO_SEGREDO) invalida todas as sessões abertas.
// Basic Auth continua aceito (curl, scripts), mas o navegador nunca mais vê o popup cinza.
const crypto = require("crypto");
const express = require("express");

const COOKIE = "casa_sessao";
const HORA = 3600000;
const SESSAO_MS = 12 * HORA; // sem "manter conectado": cookie some ao fechar o navegador e vale no máximo 12 h
const LEMBRAR_MS = 30 * 24 * HORA; // com "manter conectado": 30 dias
const FALHAS_MAX = 8; // tentativas erradas por IP...
const FALHAS_JANELA_MS = 15 * 60000; // ...a cada 15 min

const igual = (a, b) => {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function chaveDe(senha, segredo) {
  return crypto
    .createHmac("sha256", segredo || "casa-inteligente-sessao")
    .update(`sessao:${senha}`)
    .digest();
}

const assinatura = (chave, usuario, exp) =>
  crypto
    .createHmac("sha256", chave)
    .update(`${usuario}.${exp}`)
    .digest("base64url");

function criarToken(chave, usuario, exp) {
  return `${exp}.${assinatura(chave, usuario, exp)}`;
}

function validarToken(chave, usuario, token, agora = Date.now()) {
  const m = /^(\d{10,16})\.([\w-]{43})$/.exec(token || "");
  if (!m) return false;
  const exp = Number(m[1]);
  if (!(exp > agora)) return false;
  return igual(m[2], assinatura(chave, usuario, exp));
}

function lerCookie(cabecalho, nome) {
  for (const parte of String(cabecalho || "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome)
      return parte.slice(i + 1).trim();
  }
  return "";
}

// só caminhos do próprio site: "/painel/" sim; "//outro.site", "https://..." e "/\\x" não
function destinoSeguro(v) {
  return typeof v === "string" && /^\/(?![/\\])/.test(v) && !/[\r\n]/.test(v)
    ? v
    : "/";
}

function basicValido(cabecalho, usuario, senha) {
  const [tipo, valor] = String(cabecalho || "").split(" ");
  if (tipo !== "Basic" || !valor) return false;
  const txt = Buffer.from(valor, "base64").toString();
  const i = txt.indexOf(":");
  return (
    i >= 0 && igual(txt.slice(0, i), usuario) && igual(txt.slice(i + 1), senha)
  );
}

// limite de tentativas erradas por IP (memória; reinicia com o servidor)
function criarLimite({ max = FALHAS_MAX, janela = FALHAS_JANELA_MS } = {}) {
  const falhas = new Map();
  const vivo = (ip, agora) => {
    const f = falhas.get(ip);
    if (f && f.ate <= agora) falhas.delete(ip);
    return falhas.get(ip);
  };
  return {
    bloqueado: (ip, agora = Date.now()) => (vivo(ip, agora)?.n || 0) >= max,
    falhou(ip, agora = Date.now()) {
      const f = vivo(ip, agora) || { n: 0, ate: agora + janela };
      f.n++;
      falhas.set(ip, f);
    },
    limpar: (ip) => falhas.delete(ip),
  };
}

/**
 * Instala /entrar, /sair e a proteção das demais rotas.
 * @param app       express
 * @param usuario   PAINEL_USUARIO
 * @param senha     PAINEL_SENHA — vazia: nada é protegido (desenvolvimento) e /entrar só redireciona
 * @param segredo   SESSAO_SEGREDO opcional
 * @param pagina    caminho do HTML da tela de login
 * @param abertos   regex de caminhos que não pedem login (health check, casca do PWA, a própria tela)
 */
function instalarAuth(app, { usuario, senha, segredo, pagina, abertos = [] }) {
  const chave = chaveDe(senha, segredo);
  const limite = criarLimite();
  const logado = (req) =>
    !senha ||
    validarToken(chave, usuario, lerCookie(req.headers.cookie, COOKIE)) ||
    basicValido(req.headers.authorization, usuario, senha);
  const cookie = (req, valor, maxAgeMs) =>
    [
      `${COOKIE}=${valor}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      req.secure ? "Secure" : "",
      maxAgeMs != null ? `Max-Age=${Math.floor(maxAgeMs / 1000)}` : "",
    ]
      .filter(Boolean)
      .join("; ");

  app.get("/entrar", (req, res) => {
    if (logado(req)) return res.redirect(303, destinoSeguro(req.query.volta));
    res.set("Cache-Control", "no-store").sendFile(pagina);
  });

  app.post(
    "/entrar",
    express.urlencoded({ extended: false, limit: "4kb" }),
    (req, res) => {
      const volta = destinoSeguro(req.body?.volta);
      const voltar = (erro) =>
        res.redirect(
          303,
          `/entrar?erro=${erro}&volta=${encodeURIComponent(volta)}`,
        );
      if (!senha) return res.redirect(303, volta);
      if (limite.bloqueado(req.ip)) return voltar("bloqueado");
      const ok =
        igual(String(req.body?.usuario ?? "").trim(), usuario) &&
        igual(String(req.body?.senha ?? ""), senha);
      if (!ok) {
        limite.falhou(req.ip);
        return voltar("senha");
      }
      limite.limpar(req.ip);
      const lembrar = req.body?.lembrar === "1";
      const exp = Date.now() + (lembrar ? LEMBRAR_MS : SESSAO_MS);
      res.set(
        "Set-Cookie",
        cookie(
          req,
          criarToken(chave, usuario, exp),
          lembrar ? LEMBRAR_MS : null,
        ),
      );
      res.redirect(303, volta);
    },
  );

  app.post("/sair", (req, res) => {
    res.set("Set-Cookie", cookie(req, "", 0));
    res.redirect(303, senha ? "/entrar" : "/");
  });

  if (!senha) return;
  app.use((req, res, next) => {
    if (abertos.some((re) => re.test(req.path)) || logado(req)) return next();
    // página: vai para a tela de login e volta para onde estava; /api e arquivos: 401 (o app trata)
    const navegacao =
      req.method === "GET" &&
      !req.path.startsWith("/api/") &&
      (req.headers["sec-fetch-mode"] === "navigate" ||
        (!req.headers["sec-fetch-mode"] &&
          /text\/html/.test(req.headers.accept || "")));
    if (navegacao)
      return res.redirect(
        302,
        `/entrar?volta=${encodeURIComponent(destinoSeguro(req.originalUrl))}`,
      );
    res.status(401).json({ erro: "Sessão expirada. Entre de novo." });
  });
}

module.exports = {
  instalarAuth,
  criarToken,
  validarToken,
  chaveDe,
  lerCookie,
  destinoSeguro,
  basicValido,
  criarLimite,
  COOKIE,
};
