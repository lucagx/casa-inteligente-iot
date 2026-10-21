/*
 * Casa Inteligente 3D — servidor
 * ------------------------------------------------------------------
 * Ponte em tempo real entre o NodeMCU ESP8266 (via Blynk Cloud) e a casa 3D.
 *
 *   NodeMCU ── Wi-Fi ──> Blynk Cloud <── HTTP ── este servidor ── SSE ──> navegador (3D)
 *
 * Pinos virtuais (iguais ao firmware/casa_inteligente):
 *   V0 luz (LED D1)   V1 trava da porta (LED D0)   V2 comando janela (servo D7)
 *   V3 modo automático   V4 temperatura (DHT11 D2)   V5 umidade (DHT11)
 *   V6 CLARO/ESCURO (LDR A0)   V7 estado da janela   V8 status do alarme (buzzer D8)
 *   V9 armar alarme   V10 luminosidade % (LDR)   V11 presença (PIR D5)
 *   V12 distância do carro na garagem em cm (HC-SR04 D4/D6)
 *   V14 detecções de presença hoje
 *
 * SENSORES (.env)  : LDR e HC-SR04 saíram do protoboard. Por padrão o servidor não lê nem simula
 *                    V6/V10/V12 e a casa 3D esconde tudo deles. SENSORES=ldr,garagem religa.
 * PAINEL_SENHA     : com a variável definida, tudo (páginas, /api e o stream) pede usuário e senha
 *                    (Basic Auth; usuário em PAINEL_USUARIO, padrão "casa"). Sem ela fica aberto (dev).
 * DATABASE_URL     : Postgres do histórico (server/history.js). Sem ela, o histórico fica em memória.
 *                    Rotas GET /api/history e GET /api/events; HISTORICO_POLL_MS = consulta de fundo.
 *
 * MODO AO VIVO     : BLYNK_TOKEN configurado no .env. O servidor lê os pinos
 *                    virtuais do seu dispositivo e envia cada mudança para a
 *                    página na hora (Server-Sent Events). Comandos da página
 *                    vão para o Blynk, que repassa à placa.
 * MODO DEMONSTRAÇÃO: sem token (ou DEMO=true). O servidor simula os sensores
 *                    e aplica exatamente as mesmas regras do firmware, para
 *                    apresentar mesmo sem a placa.
 */

require("dotenv").config({ quiet: true });
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { criarHistorico, RETENCAO_DIAS } = require("./server/history");

const PORT = Number(process.env.PORT || 3000);
const TOKEN = (process.env.BLYNK_TOKEN || "").trim();
const SERVER = (process.env.BLYNK_SERVER || "blynk.cloud").trim();
const POLL_MS = Math.max(800, Number(process.env.POLL_INTERVAL_MS || 1200));
const HAS_TOKEN = TOKEN && !TOKEN.startsWith("cole_aqui");
const MODE = process.env.DEMO === "true" || !HAS_TOKEN ? "demo" : "live";

// Sensores opcionais (iguais às flags USAR_LDR / USAR_HCSR04 do firmware)
const SENSORES_ON = new Set((process.env.SENSORES || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
const SENSORES = { ldr: SENSORES_ON.has("ldr"), garagem: SENSORES_ON.has("garagem") };

// Pinos virtuais (os mesmos do firmware); V6/V10 só com o LDR e V12 só com o HC-SR04
const PINS = ["V0", "V1", "V3", "V4", "V5", "V7", "V8", "V9", "V11", "V14"]
  .concat(SENSORES.ldr ? ["V6", "V10"] : [], SENSORES.garagem ? ["V12"] : []);
const WRITABLE = new Set(["V0", "V1", "V2", "V3", "V9"]);

// Limiares idênticos ao firmware
const TEMP_ABRIR = 30.0;
const TEMP_FECHAR = 27.0;
const LUZ_ESCURO_PCT = 35; // LIMIAR_ESCURO_PCT no firmware (LDR no A0)
const ALARME_MS = 4000;

const app = express();

// ------------------------------------------------------------------
// Senha do painel (Basic Auth) — o link público controla luz, porta e alarme
// ------------------------------------------------------------------
const SENHA = process.env.PAINEL_SENHA || "";
const USUARIO = process.env.PAINEL_USUARIO || "casa";
const igual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
// no Render (variável RENDER) o link é público: sem senha o servidor não sobe
if (process.env.RENDER && !SENHA) {
  console.error("[painel] PAINEL_SENHA não definida no Render — defina a variável no painel do serviço.");
  process.exit(1);
}
// /healthz fica aberto (sem dados) para o health check do Render e monitores
app.get("/healthz", (req, res) => res.type("text").send("ok"));
if (SENHA) {
  app.use((req, res, next) => {
    const [tipo, valor] = (req.headers.authorization || "").split(" ");
    if (tipo === "Basic" && valor) {
      const txt = Buffer.from(valor, "base64").toString();
      const i = txt.indexOf(":");
      if (i >= 0 && igual(txt.slice(0, i), USUARIO) && igual(txt.slice(i + 1), SENHA)) return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="Casa Inteligente", charset="UTF-8"');
    res.status(401).send("Senha necessária.");
  });
}

app.use(express.json());
// configuração lida pela casa 3D (mesma fonte do servidor: .env SENSORES)
app.get("/js/config.js", (req, res) => {
  res.type("application/javascript").set("Cache-Control", "no-store");
  res.send(`// gerado pelo servidor a partir do .env (SENSORES)\nexport const SENSORES = ${JSON.stringify(SENSORES)};\n`);
});
app.use(express.static(path.join(__dirname, "public")));
// three.js e fontes servidos localmente: a apresentação funciona sem internet
// (só o Blynk precisa de internet, no modo ao vivo)
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules/three")));
app.use("/vendor/fonts", express.static(path.join(__dirname, "node_modules/@fontsource")));

// ------------------------------------------------------------------
// Estado compartilhado
// ------------------------------------------------------------------
let state = {
  mode: MODE,
  blynkOnline: false,
  deviceOnline: false,
  error: null,
  ts: Date.now(),
  readAt: null, // hora da última leitura bem-sucedida dos sensores (ts muda a cada batimento)
  // no modo ao vivo começa vazio: a página mostra "--" até a primeira leitura real
  values: MODE === "live" ? {} : {
    V0: "0", V1: "0", V3: "1", V4: "24.0", V5: "58",
    V7: "FECHADA", V8: "DESARMADO", V9: "0", V11: "0", V14: "0",
    ...(SENSORES.ldr ? { V6: "CLARO", V10: "72" } : {}),
    ...(SENSORES.garagem ? { V12: "120" } : {}),
  },
};

const clients = new Set();

function broadcast() {
  state.ts = Date.now();
  const payload = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) res.write(payload);
}

// Histórico (H3): leituras e eventos para o IoB; Postgres com DATABASE_URL, senão memória
const historico = criarHistorico({
  url: (process.env.DATABASE_URL || "").trim(),
  demo: MODE === "demo",
  valores: () => state.values,
  lidoEm: () => state.readAt,
});
// cada evento novo também vai pelo stream (event: evento), para a linha do tempo do painel
historico.aoEvento((ev) => {
  const payload = `event: evento\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) res.write(payload);
});

function setValues(patch) {
  const mudou = {}, antes = {};
  for (const [k, v] of Object.entries(patch)) {
    const s = String(v);
    if (state.values[k] !== s) {
      antes[k] = state.values[k];
      state.values[k] = s;
      mudou[k] = s;
    }
  }
  const changed = Object.keys(mudou).length > 0;
  if (changed) historico.registrar(mudou, antes);
  return changed;
}

// ------------------------------------------------------------------
// MODO AO VIVO — Blynk Cloud
// ------------------------------------------------------------------
const base = `https://${SERVER}/external/api`;

async function blynkGet(pins) {
  const url = `${base}/get?token=${encodeURIComponent(TOKEN)}&${pins.join("&")}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Blynk ${r.status}: ${text.slice(0, 120)}`);
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  const out = {};
  if (pins.length === 1) {
    out[pins[0]] = Array.isArray(data) ? data[0] : data;
  } else if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data)) out[k.toUpperCase()] = Array.isArray(v) ? v[0] : v;
  } else if (Array.isArray(data)) {
    pins.forEach((p, i) => (out[p] = data[i]));
  }
  return out;
}

// pinos que de fato existem no Blynk: um datastream que falta (ex.: V14 antes de criar no Console)
// derruba a leitura em lote; depois da 1ª leitura pino a pino só os que responderam continuam
let pinosAtivos = PINS;
async function pollBlynk() {
  try {
    let vals;
    try {
      vals = await blynkGet(pinosAtivos);
    } catch (e) {
      // alguns servidores não aceitam leitura múltipla (ou falta datastream): lê pino a pino
      vals = {};
      for (const p of pinosAtivos) {
        try { Object.assign(vals, await blynkGet([p])); } catch { /* pino sem datastream */ }
      }
      if (!Object.keys(vals).length) throw e;
      const ok = pinosAtivos.filter((p) => p in vals);
      if (ok.length < pinosAtivos.length) {
        console.warn(`[blynk] sem datastream: ${pinosAtivos.filter((p) => !(p in vals)).join(", ")} (ignorados)`);
        pinosAtivos = ok;
      }
    }
    const changed = setValues(vals);
    state.readAt = Date.now();
    const wasOnline = state.blynkOnline;
    state.blynkOnline = true;
    state.error = null;
    if (changed || !wasOnline) broadcast();
  } catch (err) {
    if (state.blynkOnline || state.error !== err.message) {
      state.blynkOnline = false;
      state.error = err.message;
      broadcast();
    }
  }
}

let placaVista = false; // a 1ª resposta só registra o estado, sem evento de online/offline
async function pollDevice() {
  try {
    const r = await fetch(`${base}/isHardwareConnected?token=${encodeURIComponent(TOKEN)}`, {
      signal: AbortSignal.timeout(5000),
    });
    const online = (await r.text()).trim() === "true";
    if (online !== state.deviceOnline) {
      state.deviceOnline = online;
      if (placaVista) historico.evento("placa", "sistema", online ? "online" : "offline");
      broadcast();
    }
    placaVista = true;
  } catch { /* mantém último estado */ }
}

async function blynkUpdate(pin, value) {
  const url = `${base}/update?token=${encodeURIComponent(TOKEN)}&${pin}=${encodeURIComponent(value)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Blynk ${r.status}: ${(await r.text()).slice(0, 120)}`);
}

// ------------------------------------------------------------------
// MODO DEMONSTRAÇÃO — mesmas regras do firmware
// ------------------------------------------------------------------
const sim = { temp: 24, umid: 58, luz: 72, presenca: false, dist: 120, alarmeAte: 0 };

function simTick() {
  const v = state.values;
  const auto = v.V3 === "1";
  const armado = v.V9 === "1";
  const patch = {
    V4: sim.temp.toFixed(1),
    V5: Math.round(sim.umid),
    V11: sim.presenca ? 1 : 0,
  };
  if (SENSORES.ldr) {
    patch.V10 = Math.round(sim.luz);
    patch.V6 = sim.luz < LUZ_ESCURO_PCT ? "ESCURO" : "CLARO";
  }
  if (SENSORES.garagem) patch.V12 = Math.round(sim.dist);
  // contador de detecções (V14): cada nova presença soma 1, como no firmware
  if (sim.presenca && v.V11 !== "1") patch.V14 = Number(v.V14 || 0) + 1;

  if (auto) {
    if (sim.temp >= TEMP_ABRIR && v.V7 === "FECHADA") patch.V7 = "ABERTA";
    else if (sim.temp <= TEMP_FECHAR && v.V7 === "ABERTA") patch.V7 = "FECHADA";
    // firmware: luz acende com presença (PIR); com o LDR, só quando está escuro
    patch.V0 = sim.presenca && (!SENSORES.ldr || sim.luz < LUZ_ESCURO_PCT) ? 1 : 0;
  }

  const now = Date.now();
  state.readAt = now;
  if (armado && sim.presenca && now > sim.alarmeAte) sim.alarmeAte = now + ALARME_MS;
  if (now < sim.alarmeAte && armado) patch.V8 = "ALARME ATIVO";
  else patch.V8 = armado ? "ARMADO" : "DESARMADO";

  if (setValues(patch)) broadcast();
}

function simCommand(pin, value) {
  const v = state.values;
  const on = String(value) === "1";
  const manual = v.V3 === "0";
  if (pin === "V3") setValues({ V3: on ? 1 : 0 });
  if (pin === "V9") {
    setValues({ V9: on ? 1 : 0 });
    if (!on) sim.alarmeAte = 0;
  }
  // assim como no firmware: comandos de atuador só valem no modo manual
  if (manual && pin === "V0") setValues({ V0: on ? 1 : 0 });
  if (manual && pin === "V1") setValues({ V1: on ? 1 : 0 });
  if (manual && pin === "V2") setValues({ V7: on ? "ABERTA" : "FECHADA" });
  simTick();
  broadcast();
}

// ------------------------------------------------------------------
// Rotas
// ------------------------------------------------------------------
app.get("/api/state", (_req, res) => res.json(state));

app.get("/api/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`retry: 2000\nevent: state\ndata: ${JSON.stringify(state)}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(`: ping\n\n`), 15000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

app.post("/api/command", async (req, res) => {
  const { pin, value } = req.body || {};
  if (!WRITABLE.has(pin)) return res.status(400).json({ ok: false, error: `Pino ${pin} não aceita comando.` });
  historico.comando(pin); // as mudanças que vierem deste comando ficam com origem "painel"
  try {
    if (MODE === "demo") {
      simCommand(pin, value);
    } else {
      await blynkUpdate(pin, value);
      // reflete na hora; a próxima leitura do Blynk confirma o valor real
      if (pin === "V2") setValues({ V7: String(value) === "1" ? "ABERTA" : "FECHADA" });
      else setValues({ [pin]: value });
      broadcast();
      setTimeout(pollBlynk, 400);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Controles de sensores simulados (apenas no modo demonstração)
app.post("/api/sim", (req, res) => {
  if (MODE !== "demo") return res.status(409).json({ ok: false, error: "Disponível só no modo demonstração." });
  const { temp, luz, umid, presenca, dist } = req.body || {};
  if (temp !== undefined) sim.temp = Math.min(50, Math.max(0, Number(temp)));
  if (luz !== undefined && SENSORES.ldr) sim.luz = Math.min(100, Math.max(0, Number(luz)));
  if (umid !== undefined) sim.umid = Math.min(100, Math.max(0, Number(umid)));
  if (presenca !== undefined) sim.presenca = !!presenca;
  if (dist !== undefined && SENSORES.garagem) sim.dist = Math.min(200, Math.max(2, Number(dist)));
  simTick();
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// Histórico (H3) — usado pelo painel IoB (gráficos, linha do tempo, consumo)
// ------------------------------------------------------------------
const DIA_MS = 86400000;
// "24h", "7d", "30m", data ISO ou milissegundos
function quando(txt, padrao) {
  if (txt === undefined || txt === "") return padrao;
  const rel = /^(\d+(?:\.\d+)?)(m|h|d)$/.exec(String(txt));
  if (rel) return Date.now() - Number(rel[1]) * { m: 60000, h: 3600000, d: DIA_MS }[rel[2]];
  const n = Number(txt);
  return Number.isFinite(n) ? n : Date.parse(txt);
}
function periodo(q) {
  const ate = quando(q.ate, Date.now());
  const desde = Math.max(quando(q.desde, ate - DIA_MS), ate - RETENCAO_DIAS * DIA_MS);
  return Number.isFinite(desde) && Number.isFinite(ate) && desde <= ate ? { desde, ate } : null;
}
const lista = (txt) => (txt ? String(txt).split(",").map((x) => x.trim()).filter(Boolean) : null);

app.get("/api/history", async (req, res) => {
  const p = periodo(req.query);
  if (!p) return res.status(400).json({ ok: false, error: "Período inválido: use desde/ate como 24h, 7d, data ISO ou ms." });
  const pinos = (lista(req.query.pinos)?.map((x) => x.toUpperCase()) || PINS).filter((x) => /^V\d{1,3}$/.test(x));
  try {
    res.json(await historico.leituras({ ...p, pinos }));
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.get("/api/events", async (req, res) => {
  const p = periodo({ desde: "7d", ...req.query });
  if (!p) return res.status(400).json({ ok: false, error: "Período inválido: use desde/ate como 24h, 7d, data ISO ou ms." });
  const limite = Math.min(1000, Math.max(1, Number(req.query.limite) || 200));
  try {
    res.json(await historico.eventos({ ...p, tipos: lista(req.query.tipo), limite }));
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ------------------------------------------------------------------
// Início
// ------------------------------------------------------------------
// sem página aberta, uma consulta leve de fundo mantém o histórico (0 desliga)
const HIST_POLL_MS = Number(process.env.HISTORICO_POLL_MS ?? 60000);
if (MODE === "live") {
  // só consulta o Blynk no ritmo rápido enquanto houver alguém com a página aberta,
  // para economizar a cota de requisições do plano gratuito
  setInterval(() => clients.size && pollBlynk(), POLL_MS);
  setInterval(() => clients.size && pollDevice(), 5000);
  if (HIST_POLL_MS > 0) setInterval(() => !clients.size && pollBlynk(), Math.max(POLL_MS, HIST_POLL_MS));
  pollBlynk();
  pollDevice();
} else {
  state.blynkOnline = false;
  state.deviceOnline = true; // o "dispositivo" simulado está sempre ligado
  setInterval(() => {
    // leve variação natural da umidade para dar vida aos números
    sim.umid += (Math.random() - 0.5) * 0.6;
    sim.umid = Math.min(75, Math.max(40, sim.umid));
    simTick();
  }, 1000);
}

// batimento: mantém a página informada de que o elo está vivo
setInterval(() => clients.size && broadcast(), 3000);

historico.iniciar().catch((err) => console.warn(`[historico] ao iniciar: ${err.message}`));
// o Render manda SIGTERM a cada deploy: grava o que estiver na fila antes de sair
for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.once(sinal, () => historico.fechar().catch(() => {}).finally(() => process.exit(0)));
}

app.listen(PORT, "0.0.0.0", () => {
  const os = require("os");
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log("\n  Casa Inteligente 3D");
  console.log(`  Modo: ${MODE === "live" ? `AO VIVO (Blynk: ${SERVER})` : "DEMONSTRAÇÃO (sensores simulados)"}`);
  console.log(`  Sensores opcionais: LDR ${SENSORES.ldr ? "ligado" : "desligado"} · HC-SR04 ${SENSORES.garagem ? "ligado" : "desligado"}`);
  console.log(`  Senha do painel: ${SENHA ? `ativa (usuário "${USUARIO}")` : "desligada (defina PAINEL_SENHA antes de publicar)"}`);
  console.log(`  Histórico: ${historico.descricao}${MODE === "live" ? ` · consulta de fundo ${HIST_POLL_MS > 0 ? `a cada ${Math.max(POLL_MS, HIST_POLL_MS) / 1000} s` : "desligada"}` : ""}`);
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`  Publicado em: ${process.env.RENDER_EXTERNAL_URL}`);
  } else {
    console.log(`  Neste computador: http://localhost:${PORT}`);
    ips.forEach((ip) => console.log(`  No celular (mesmo Wi-Fi): http://${ip}:${PORT}`));
  }
  console.log("");
});
