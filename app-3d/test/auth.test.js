// Testes do login (server/auth.js): npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const http = require("http");
const express = require("express");
const {
  instalarAuth,
  criarToken,
  validarToken,
  chaveDe,
  lerCookie,
  destinoSeguro,
  basicValido,
  criarLimite,
  COOKIE,
} = require("../server/auth");

const K = chaveDe("segredo123");

test("token assinado vale até expirar", () => {
  const agora = 1_800_000_000_000;
  const t = criarToken(K, "casa", agora + 1000);
  assert.ok(validarToken(K, "casa", t, agora));
  assert.ok(!validarToken(K, "casa", t, agora + 1000), "expirado");
  assert.ok(!validarToken(K, "outro", t, agora), "outro usuário");
  assert.ok(
    !validarToken(chaveDe("senha-nova"), "casa", t, agora),
    "senha trocada invalida",
  );
});

test("token adulterado não vale", () => {
  const agora = 1_800_000_000_000;
  const [exp, sig] = criarToken(K, "casa", agora + 1000).split(".");
  assert.ok(
    !validarToken(K, "casa", `${Number(exp) + 99999}.${sig}`, agora),
    "validade esticada",
  );
  assert.ok(!validarToken(K, "casa", "", agora));
  assert.ok(!validarToken(K, "casa", "abc.def", agora));
});

test("lê o cookie certo no cabeçalho", () => {
  assert.equal(lerCookie(`a=1; ${COOKIE}=xyz; b=2`, COOKIE), "xyz");
  assert.equal(lerCookie("a=1", COOKIE), "");
  assert.equal(lerCookie(undefined, COOKIE), "");
});

test("destino só dentro do site", () => {
  assert.equal(destinoSeguro("/painel/"), "/painel/");
  assert.equal(destinoSeguro("/?x=1"), "/?x=1");
  assert.equal(destinoSeguro("//mal.site"), "/");
  assert.equal(destinoSeguro("/\\mal.site"), "/");
  assert.equal(destinoSeguro("https://mal.site"), "/");
  assert.equal(destinoSeguro(undefined), "/");
});

test("Basic Auth continua aceito", () => {
  const b = (s) => `Basic ${Buffer.from(s).toString("base64")}`;
  assert.ok(basicValido(b("casa:segredo123"), "casa", "segredo123"));
  assert.ok(!basicValido(b("casa:errada"), "casa", "segredo123"));
  assert.ok(!basicValido("Bearer x", "casa", "segredo123"));
});

test("limite de tentativas por IP", () => {
  const l = criarLimite({ max: 3, janela: 1000 });
  for (let i = 0; i < 3; i++) l.falhou("ip", 0);
  assert.ok(l.bloqueado("ip", 500));
  assert.ok(!l.bloqueado("ip", 1000), "janela passou");
  assert.ok(!l.bloqueado("outro", 500));
});

// servidor de verdade numa porta livre
async function comServidor(senha, fn) {
  const app = express();
  instalarAuth(app, {
    usuario: "casa",
    senha,
    pagina: path.join(__dirname, "../public/entrar/index.html"),
    abertos: [/^\/healthz$/],
  });
  app.get("/healthz", (_q, r) => r.send("ok"));
  app.get("/api/state", (_q, r) => r.json({ ok: true }));
  app.get("/painel/", (_q, r) => r.send("painel"));
  const srv = app.listen(0);
  await new Promise((r) => srv.once("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    await fn(base);
  } finally {
    srv.close();
  }
}
const form = (o) => ({
  method: "POST",
  redirect: "manual",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
});

test("sem sessão: página vai para /entrar, API responde 401", () =>
  comServidor("segredo123", async (base) => {
    // navegação do navegador (http puro: o fetch do Node troca o Sec-Fetch-Mode por "cors")
    const p = await new Promise((ok, erro) =>
      http
        .get(
          `${base}/painel/`,
          { headers: { "Sec-Fetch-Mode": "navigate", Accept: "text/html" } },
          (r) => {
            r.resume();
            ok(r);
          },
        )
        .on("error", erro),
    );
    assert.equal(p.statusCode, 302);
    assert.equal(p.headers.location, "/entrar?volta=%2Fpainel%2F");
    const a = await fetch(`${base}/api/state`, { headers: { Accept: "*/*" } });
    assert.equal(a.status, 401);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    const tela = await fetch(`${base}/entrar`);
    assert.equal(tela.status, 200);
    assert.match(await tela.text(), /action="\/entrar"/);
  }));

test("login certo dá cookie e libera; errado volta com erro", () =>
  comServidor("segredo123", async (base) => {
    const errado = await fetch(
      `${base}/entrar`,
      form({ usuario: "casa", senha: "x", volta: "/painel/" }),
    );
    assert.equal(errado.status, 303);
    assert.equal(
      errado.headers.get("location"),
      "/entrar?erro=senha&volta=%2Fpainel%2F",
    );
    assert.equal(errado.headers.get("set-cookie"), null);

    const certo = await fetch(
      `${base}/entrar`,
      form({
        usuario: "casa",
        senha: "segredo123",
        volta: "/painel/",
        lembrar: "1",
      }),
    );
    assert.equal(certo.status, 303);
    assert.equal(certo.headers.get("location"), "/painel/");
    const sc = certo.headers.get("set-cookie");
    assert.match(sc, /HttpOnly/);
    assert.match(sc, /SameSite=Lax/);
    assert.match(sc, /Max-Age=2592000/);
    const cookie = sc.split(";")[0];
    const api = await fetch(`${base}/api/state`, {
      headers: { Cookie: cookie },
    });
    assert.equal(api.status, 200);

    const sair = await fetch(`${base}/sair`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: cookie },
    });
    assert.equal(sair.headers.get("location"), "/entrar");
    assert.match(sair.headers.get("set-cookie"), /Max-Age=0/);
  }));

test("destino externo no login vira a raiz", () =>
  comServidor("segredo123", async (base) => {
    const r = await fetch(
      `${base}/entrar`,
      form({ usuario: "casa", senha: "segredo123", volta: "//mal.site" }),
    );
    assert.equal(r.headers.get("location"), "/");
  }));

test("sem senha configurada nada é bloqueado", () =>
  comServidor("", async (base) => {
    assert.equal((await fetch(`${base}/api/state`)).status, 200);
    const e = await fetch(`${base}/entrar?volta=/painel/`, {
      redirect: "manual",
    });
    assert.equal(e.status, 303);
    assert.equal(e.headers.get("location"), "/painel/");
  }));
