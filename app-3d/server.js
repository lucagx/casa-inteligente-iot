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
 * PRESENCA_POLL_MS : leitura rápida só do V11 (padrão 500 ms) enquanto há página aberta (B5); 0 desliga.
 * CONSUMO_W, TARIFA_KWH, TARIFA_BRANCA, META_MENSAL_KWH : consumo e economia (I3, server/consumo.js).
 * CONSUMO_V15=1    : publica o consumo do dia (kWh) no V15 do Blynk a cada 5 min (depois de criar o datastream, K1).
 * Datastreams do servidor no Blynk (K1, server/blynk.js): V16 cena, V18 carregador, V23 luz externa, V25 bateria —
 *                    publicados quando mudam e lidos de volta (app do Blynk e automações acionam o servidor).
 *                    Eventos (K3): alertas da I7 e o resumo das 21h viram eventos/push do Blynk (logEvent).
 * CARREGADOR_KW, BATERIA_KWH : carregador do carro elétrico (V3, server/carregador.js) — virtual, fora do protoboard.
 * Rotina aprendida, sugestões, automações e modo ausente (I5): server/rotina.js, rotas /api/rotina e /api/ausente.
 * Conforto adaptativo da janela (I6): server/conforto.js, rotas /api/conforto. CONFORTO_V17=1 publica o limite no V17.
 * Insights diários e alertas (I7): server/insights.js, rotas /api/insights e /api/alertas/:id; state.alertas no stream.
 * Privacidade (I8): rotas /api/privacidade (consentimento, pausar coleta, retenção), /apagar e /exportar.
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
// B5: leitura rápida só do V11 (presença) enquanto há página aberta; 0 desliga. Cada leitura é 1 requisição ao Blynk
const PRESENCA_POLL_MS = Number(process.env.PRESENCA_POLL_MS ?? 500);
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
// casca do app do celular (PWA) também fica aberta: o navegador busca manifest, service worker e ícones
// sem credenciais. Não tem dados nem controla nada — a página /painel/ e a /api continuam com senha.
const PWA_ABERTO = /^\/painel\/(manifest\.webmanifest|sw\.js|icones\/\w[\w.-]*)$/;
if (SENHA) {
  app.use((req, res, next) => {
    if (PWA_ABERTO.test(req.path)) return next();
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
  // modelos 3D opcionais do carro (public/modelos/*.glb): sem nenhum, a casa usa o carro gerado em código.
  // CARRO_MODELO no .env escolhe qual (nome sem .glb); senão "carro", senão o primeiro da pasta
  let carros = [];
  try { carros = require("fs").readdirSync(path.join(__dirname, "public/modelos")).filter((f) => f.endsWith(".glb")).map((f) => f.slice(0, -4)).sort(); } catch { /* sem pasta */ }
  const pedido = (process.env.CARRO_MODELO || "").trim();
  const MODELOS = { carros, carro: carros.includes(pedido) ? pedido : carros.includes("carro") ? "carro" : carros[0] || null };
  res.send(`// gerado pelo servidor a partir do .env (SENSORES) e da pasta public/modelos\nexport const SENSORES = ${JSON.stringify(SENSORES)};\nexport const MODELOS = ${JSON.stringify(MODELOS)};\n`);
});
app.use(express.static(path.join(__dirname, "public")));
// three.js e fontes servidos localmente: a apresentação funciona sem internet
// (só o Blynk precisa de internet, no modo ao vivo)
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules/three")));
app.use("/vendor/fonts", express.static(path.join(__dirname, "node_modules/@fontsource")));
// gráficos do painel IoB (I2), também local
app.use("/vendor/uplot", express.static(path.join(__dirname, "node_modules/uplot/dist")));

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
  scene: null, // cena em andamento (I4): { id, nome, origem, passo, total } ou null
  presenceAt: null, // B5: hora (ms) da última detecção do PIR — "última detecção há X s" na tela
  // luzes por cômodo, nível 0–100. O LED do D1 (V0) é a luz geral: aceso enquanto algum cômodo estiver aceso
  rooms: { sala: 0, cozinha: 0, quarto: 0, externa: 0 },
  carro: null, // V3: carregador do carro elétrico (server/carregador.js), preenchido logo abaixo
  // no modo ao vivo começa vazio: a página mostra "--" até a primeira leitura real
  values: MODE === "live" ? {} : {
    V0: "0", V1: "0", V3: "1", V4: "24.0", V5: "58",
    V7: "FECHADA", V8: "DESARMADO", V9: "0", V11: "0", V14: "0",
    ...(SENSORES.ldr ? { V6: "CLARO", V10: "72" } : {}),
    ...(SENSORES.garagem ? { V12: "120" } : {}),
  },
};

const clients = new Set();
let ponte = null; // K1: datastreams do servidor no Blynk (só ao vivo), criada depois das cenas

function broadcast() {
  syncLuzes(); // luz geral (D1) x cômodos — ver "Luzes por cômodo" abaixo
  registrarComodos();
  registrarCarro();
  marcarPresenca();
  ponte?.publicar(state);
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
// (ao vivo, também os pinos que o app do Blynk/automações mudam: V16 cena, V18 carregador, V23 externa — K1)
let pinosAtivos = MODE === "live" ? PINS.concat(require("./server/blynk").ENTRADAS) : PINS;

// B5: hora da última detecção = borda de subida do V11 (0 → 1)
let ultimoV11;
function marcarPresenca() {
  const v = state.values.V11;
  if (v === "1" && ultimoV11 !== undefined && ultimoV11 !== "1") state.presenceAt = Date.now();
  ultimoV11 = v;
}

// B5: depois de um comando a placa leva um tempo para aplicar (servo ~0,7 s + repasse do Blynk). Uma leitura que
// chegue antes disso traz o valor velho e a tela "voltava" (janela aberta → fechada logo depois do clique) — e o
// histórico ganhava eventos falsos. Por até CONFIRMA_MS o valor lido daquele pino é ignorado até confirmar o comando;
// se a placa recusar (ex.: estava no automático), depois do prazo vale o valor real.
const CONFIRMA_MS = 3000;
const ESTADO_DE = { V2: "V7" }; // comando → pino onde a placa devolve o estado
const aguardando = {}; // pino de estado → { valor, ate }
function esperarConfirmacao(pin, value) {
  const valor = pin === "V2" ? (String(value) === "1" ? "ABERTA" : "FECHADA") : String(value);
  aguardando[ESTADO_DE[pin] || pin] = { valor, ate: Date.now() + CONFIRMA_MS };
}
function filtrarLeitura(vals) {
  const agora = Date.now();
  for (const [pin, a] of Object.entries(aguardando)) {
    if (!(pin in vals)) continue;
    if (String(vals[pin]) === a.valor || agora > a.ate) delete aguardando[pin];
    else delete vals[pin];
  }
  return vals;
}

// B5: só o V11, bem mais leve que a leitura geral; não roda duas ao mesmo tempo
let lendoPresenca = false;
async function pollPresenca() {
  if (lendoPresenca) return;
  lendoPresenca = true;
  try {
    if (setValues(filtrarLeitura(await blynkGet(["V11"])))) broadcast();
  } catch { /* a leitura geral cuida do erro */ }
  lendoPresenca = false;
}
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
    // V16/V18/V23 não são sensores: viram ação (cena, carregador, externa) e não entram em state.values
    const doServidor = {};
    for (const p of ponte?.entradas || []) if (p in vals) { doServidor[p] = vals[p]; delete vals[p]; }
    const changed = setValues(filtrarLeitura(vals));
    ponte?.entrada(doServidor);
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

// K3: evento do Blynk (linha do tempo + push) — o código precisa existir no template (docs/BLYNK.md)
async function blynkEvento(code, description) {
  const url = `${base}/logEvent?token=${encodeURIComponent(TOKEN)}&code=${encodeURIComponent(code)}&description=${encodeURIComponent(description)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Blynk ${r.status}: ${(await r.text()).slice(0, 120)}`);
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
  try {
    await comandar(pin, value); // origem "painel" no histórico
    if (MODE === "live") setTimeout(pollBlynk, 400); // confirma o valor real (ver esperarConfirmacao)
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ------------------------------------------------------------------
// Cenas de um toque (I4) — definições em server/cenas.js
// ------------------------------------------------------------------
const { criarCenas } = require("./server/cenas");

// mesmo caminho do /api/command: simulação no modo demonstração, Blynk no ao vivo.
// origem vai para o histórico (H3): as mudanças que vierem deste comando ficam com ela ("painel" ou "cena")
async function comandar(pin, value, origem = "painel") {
  historico.comando(pin, origem);
  if (MODE === "demo") return simCommand(pin, value);
  await blynkUpdate(pin, value);
  esperarConfirmacao(pin, value);
  // reflete na hora; a leitura do Blynk só vale de novo quando confirmar (ou depois de CONFIRMA_MS)
  if (pin === "V2") setValues({ V7: String(value) === "1" ? "ABERTA" : "FECHADA" });
  else setValues({ [pin]: value });
  broadcast();
}

// ------------------------------------------------------------------
// Luzes por cômodo — o LED do D1 (V0) é a luz geral da casa:
//   - algum cômodo aceso ⇒ D1 aceso; todos apagados ⇒ D1 apagado (setRoom)
//   - D1 mudou por fora (painel, app Blynk, regra do automático): acendeu com tudo apagado ⇒
//     acende todos os cômodos; apagou ⇒ apaga todos (syncLuzes, chamado a cada broadcast)
// ------------------------------------------------------------------
let ultimoV0;
function syncLuzes() {
  const v0 = state.values.V0;
  if (v0 === undefined || v0 === ultimoV0) return;
  ultimoV0 = v0;
  const algum = Object.values(state.rooms).some((n) => n > 0);
  if (v0 === "1" && !algum) for (const k in state.rooms) state.rooms[k] = 100;
  if (v0 === "0") for (const k in state.rooms) state.rooms[k] = 0;
}
// I3: o nível de cada cômodo vai para o histórico como leitura V20 sala, V21 cozinha, V22 quarto, V23 externa
// (base do consumo por cômodo; os mesmos números podem virar datastreams no Blynk depois)
const { COMODOS } = require("./server/consumo");
const comodosGravados = {};
function registrarComodos() {
  const mudou = {}, antes = {};
  for (const [k, pino] of Object.entries(COMODOS)) {
    const v = String(state.rooms[k]);
    if (comodosGravados[pino] !== v) { antes[pino] = comodosGravados[pino]; mudou[pino] = comodosGravados[pino] = v; }
  }
  if (Object.keys(mudou).length) historico.registrar(mudou, antes);
}
// "todos" ajusta os quatro cômodos de uma vez
async function setRoom(room, level, origem = "painel") {
  const n = Math.round(Math.min(100, Math.max(0, Number(level) || 0)));
  const alvo = room === "todos" ? Object.keys(state.rooms) : [room];
  if (!alvo.every((k) => k in state.rooms)) throw Object.assign(new Error(`Cômodo "${room}" não existe.`), { status: 400 });
  for (const k of alvo) state.rooms[k] = n;
  const algum = Object.values(state.rooms).some((x) => x > 0);
  if ((state.values.V0 === "1") !== algum) {
    if (state.values.V3 === "1") await comandar("V3", 0, origem); // o firmware só aceita comando de luz no manual
    await comandar("V0", algum ? 1 : 0, origem);
  }
  broadcast();
}
app.post("/api/room", async (req, res) => {
  const { room, level } = req.body || {};
  try {
    await setRoom(String(room || ""), level);
    res.json({ ok: true, rooms: state.rooms });
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: err.message });
  }
});

// ------------------------------------------------------------------
// Carregador do carro elétrico (V3) — virtual, como os cômodos: não passa pela placa nem pelo Blynk.
// No histórico: V24 carregando, V25 bateria %, V26 carro na garagem (ver server/carregador.js)
// ------------------------------------------------------------------
const { criarCarregador, PINOS: PINOS_CARRO } = require("./server/carregador");
const CARREGADOR_KW = Number(process.env.CARREGADOR_KW) > 0 ? Number(process.env.CARREGADOR_KW) : 2.2;
const carregador = criarCarregador({
  kW: CARREGADOR_KW,
  bateriaKWh: Number(process.env.BATERIA_KWH) > 0 ? Number(process.env.BATERIA_KWH) : 40,
});
state.carro = carregador.foto();
// até ler o último estado do histórico (ao iniciar), nada é gravado: senão o padrão viraria uma leitura falsa
let carroPronto = false;
const carroGravado = {};
function registrarCarro() {
  if (!carroPronto) return;
  const mudou = {}, antes = {};
  for (const [pino, v] of Object.entries(carregador.pinos())) {
    if (carroGravado[pino] !== v) { antes[pino] = carroGravado[pino]; mudou[pino] = carroGravado[pino] = v; }
  }
  if (Object.keys(mudou).length) historico.registrar(mudou, antes);
}
// aplica uma foto nova do carregador; "aguardando fora de ponta" vira evento (não é um pino)
function atualizarCarro(foto, origem = "automatico") {
  const antes = state.carro;
  state.carro = foto;
  if (foto.aguardando && !antes.aguardando && carroPronto) historico.evento("carregador", origem, "aguardando fora de ponta");
  const { cheioEm: _a, ...x } = foto, { cheioEm: _b, ...y } = antes;
  if (JSON.stringify(x) !== JSON.stringify(y)) broadcast();
}
// a bateria sobe e o horário fora de ponta chega sozinhos
setInterval(() => atualizarCarro(carregador.tick()), 5000);

app.post("/api/carregador", (req, res) => {
  const { ligado, foraDePonta, origem: o } = req.body || {};
  const origem = ["painel", "casa3d"].includes(o) ? o : "painel";
  historico.comando(PINOS_CARRO.carregando, origem);
  atualizarCarro(carregador.comando({ ligado, foraDePonta }), origem);
  res.json({ ok: true, carro: state.carro });
});

const cenas = criarCenas({
  // "luz:quarto" e afins = cômodos (acendem/apagam o D1 pela regra acima); "V…" = pino da placa;
  // "carro:entrar|sair" = carro na garagem (V3). No histórico, as mudanças da cena ficam com origem "cena"
  async enviar(pin, value) {
    if (pin.startsWith("luz:")) return setRoom(pin.slice(4), value, "cena");
    if (pin.startsWith("carro:")) {
      historico.comando(PINOS_CARRO.naGaragem, "cena");
      historico.comando(PINOS_CARRO.carregando, "cena"); // o cabo conecta/desconecta junto
      return atualizarCarro(pin === "carro:entrar" ? carregador.entrar() : carregador.sair(), "cena");
    }
    return comandar(pin, value, "cena");
  },
  aoMudar(cena) {
    state.scene = cena;
    broadcast();
  },
  aoTerminar(cena, erro) {
    if (MODE === "live") setTimeout(pollBlynk, 400); // confirma o estado real da placa
    // a cena em si vai para o histórico na hora em que começou; origem = onde foi tocada (painel/casa3d/blynk)
    historico.evento("cena", cena.origem, erro ? `${cena.nome} (falhou)` : cena.nome, cena.inicio);
    if (cena.id === "cheguei" && !erro) rotina.setAusente(false, "cena").catch(() => {}); // I5: chegou ⇒ sai do modo ausente
    console.log(`[cena] ${cena.nome} (${cena.origem}) ${erro ? `falhou no passo ${cena.passo + 1}: ${erro.message}` : "concluída"}`);
  },
});

app.get("/api/scenes", (_req, res) => res.json(cenas.lista()));

// ------------------------------------------------------------------
// Datastreams do servidor no Blynk (K1) — server/blynk.js. Só no modo ao vivo; origem "blynk" no histórico
// ------------------------------------------------------------------
if (MODE === "live") {
  const { criarPonte } = require("./server/blynk");
  ponte = criarPonte({
    enviar: blynkUpdate,
    avisar: (txt) => console.warn(`[blynk] ${txt}`),
    async executar(a) {
      if (a.tipo === "cena") return cenas.executar(a.id, "blynk");
      if (a.tipo === "externa") return setRoom("externa", a.nivel, "blynk");
      if (a.tipo === "carregador") {
        historico.comando(PINOS_CARRO.carregando, "blynk");
        return atualizarCarro(carregador.comando({ ligado: a.ligado }), "blynk");
      }
    },
  });
}

app.post("/api/scene", (req, res) => {
  const { nome, origem } = req.body || {};
  try {
    const c = cenas.executar(String(nome || ""), ["painel", "casa3d", "blynk"].includes(origem) ? origem : "painel");
    res.status(202).json({ ok: true, ...c });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ------------------------------------------------------------------
// Rotina aprendida e modo ausente (I5) — aprendizado e sugestões em server/rotina.js
// ------------------------------------------------------------------
const { criarRotina } = require("./server/rotina");
const rotina = criarRotina({
  historico, setRoom,
  estado: () => state,
  comandar: async (pin, value, origem) => {
    await comandar(pin, value, origem);
    if (MODE === "live") setTimeout(pollBlynk, 400);
  },
  aoMudar() { state.iob = rotina.estadoResumido(); broadcast(); },
});
state.iob = rotina.estadoResumido();
const responder = (res, fn) => fn().then(() => res.json({ ok: true, ...rotina.resumo() }))
  .catch((err) => res.status(err.status || 500).json({ ok: false, error: err.message }));
app.get("/api/rotina", (_req, res) => res.json(rotina.resumo()));
// { id, aceitar: true|false } — aceitar cria a automação / executa a ação; false dispensa
app.post("/api/rotina/sugestao", (req, res) => {
  const { id, aceitar } = req.body || {};
  responder(res, () => (aceitar === false ? rotina.dispensar(String(id)) : rotina.aceitar(String(id))));
});
app.delete("/api/rotina/automacao/:id", (req, res) => responder(res, () => rotina.removerAutomacao(req.params.id)));
app.post("/api/ausente", (req, res) => responder(res, () => rotina.setAusente(!!(req.body || {}).ligado)));

// ------------------------------------------------------------------
// Conforto adaptativo da janela (I6) — limites aprendidos dos ajustes manuais (server/conforto.js)
// ------------------------------------------------------------------
const { criarConforto } = require("./server/conforto");
const conforto = criarConforto({
  historico,
  estado: () => state,
  comandar: async (pin, value, origem) => {
    await comandar(pin, value, origem);
    if (MODE === "live") setTimeout(pollBlynk, 400);
  },
  aoMudar() { state.conforto = conforto.estadoResumido(); broadcast(); },
  // V17 só existe depois de criar o datastream e atualizar o firmware para ler o limite
  publicarV17: MODE === "live" && process.env.CONFORTO_V17 === "1" ? (v) => blynkUpdate("V17", v) : null,
});
state.conforto = conforto.estadoResumido();
app.get("/api/conforto", (_req, res) => res.json(conforto.resumo()));
app.post("/api/conforto", (req, res) => {
  conforto.setAplicar(!!(req.body || {}).aplicar)
    .then(() => res.json({ ok: true, ...conforto.resumo() }))
    .catch((err) => res.status(500).json({ ok: false, error: err.message }));
});

// ------------------------------------------------------------------
// Insights diários e alertas (I7) — server/insights.js
// ------------------------------------------------------------------
const { insights, criarAlertas, inicioDoDia } = require("./server/insights");
// K3: push pelo Blynk (só ao vivo)
const eventosBlynk = MODE === "live"
  ? require("./server/blynk").criarEventos({ enviar: blynkEvento, avisar: (txt) => console.warn(`[blynk] ${txt}`) })
  : null;
const alertas = criarAlertas({
  historico,
  estado: () => state,
  async executar(acao) {
    if (acao.carregador) return atualizarCarro(carregador.comando({ ligado: true }), "painel");
    // o firmware só aceita porta/janela no manual (o alarme vale em qualquer modo)
    if (acao.pino !== "V9" && state.values.V3 === "1") await comandar("V3", 0);
    await comandar(acao.pino, acao.valor);
    if (MODE === "live") setTimeout(pollBlynk, 400);
  },
  aoMudar() { state.alertas = alertas.lista(); broadcast(); },
  aoNovo: (a) => eventosBlynk?.alerta(a),
});
state.alertas = [];
alertas.iniciar();
app.post("/api/alertas/:id", (req, res) => {
  const resposta = (req.body || {}).resposta === "executar" ? "executar" : "ok";
  alertas.responder(req.params.id, resposta)
    .then(() => res.json({ ok: true, alertas: alertas.lista() }))
    .catch((err) => res.status(err.status || 502).json({ ok: false, error: err.message }));
});
// ?dia=hoje (padrão) | ontem | data ISO
app.get("/api/insights", async (req, res) => {
  const agora = Date.now();
  const q = String(req.query.dia || "hoje");
  const dia = q === "hoje" ? agora : q === "ontem" ? inicioDoDia(agora) - 1 : Date.parse(q);
  if (!Number.isFinite(dia) || dia > agora) return res.status(400).json({ ok: false, error: "Dia inválido: use hoje, ontem ou uma data." });
  try {
    res.json(await calcularInsights(dia, agora));
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});
async function calcularInsights(dia, agora = Date.now()) {
  const ini = inicioDoDia(dia), desde = Math.max(ini - 7 * DIA_MS, agora - RETENCAO_DIAS * DIA_MS), ate = Math.min(ini + DIA_MS, agora);
  const [evs, lt, cons] = await Promise.all([
    historico.eventos({ desde, ate, limite: 50000 }),
    historico.leituras({ desde, ate, pinos: ["V0"] }),
    calcularConsumo().catch(() => null),
  ]);
  const d = cons?.dias.find((x) => x.ts === ini);
  return insights({ eventos: evs.eventos, v0: { pts: lt.pinos.V0, antes: lt.antes.V0 }, dia: ini, agora, consumoDia: d ? { kWh: d.kWh, reais: d.kWh * cons.tarifa, porComodo: d.porComodo } : null });
}
// K3: resumo do dia no Blynk (evento resumo_diario, com push) a partir das 21h, uma vez por dia.
// Com o Render dormindo às 21h, vai quando ele acordar (até meia-noite). O dia enviado fica na config do histórico.
if (eventosBlynk) {
  const RESUMO_HORA = 21;
  let resumoDe = null;
  historico.lerConfig("blynk").then((c) => { resumoDe = c?.resumoDe ?? null; }).catch(() => {});
  setInterval(async () => {
    const agora = Date.now(), dia = inicioDoDia(agora);
    if (new Date(agora).getHours() < RESUMO_HORA || resumoDe === dia) return;
    resumoDe = dia;
    try {
      const r = await calcularInsights(agora, agora);
      if (eventosBlynk.resumo(r.frases.join(" ") || "Dia tranquilo, sem movimento registrado.")) {
        await historico.salvarConfig("blynk", { resumoDe: dia });
      }
    } catch (err) {
      console.warn(`[blynk] resumo do dia: ${err.message}`);
    }
  }, 60000);
}

// ------------------------------------------------------------------
// Privacidade e consentimento (I8) — a ética do IoB: o morador decide o que fica guardado
// ------------------------------------------------------------------
let privacidade = { consentimento: null, pausado: false, retencaoDias: RETENCAO_DIAS };
const resumoPrivacidade = () => ({ consentimento: privacidade.consentimento, pausado: historico.pausado, retencaoDias: historico.retencao });
async function carregarPrivacidade() {
  const salvo = await historico.lerConfig("privacidade");
  if (salvo) privacidade = { ...privacidade, ...salvo };
  historico.pausar(privacidade.pausado, "sistema", false); // ao reiniciar, sem evento repetido
  await historico.setRetencao(privacidade.retencaoDias).catch(() => {});
  state.privacidade = resumoPrivacidade();
}
state.privacidade = resumoPrivacidade();
app.get("/api/privacidade", async (_req, res) => {
  let contagem = null;
  try { contagem = await historico.contar(); } catch { /* banco fora: mostra o resto */ }
  res.json({ ...resumoPrivacidade(), motor: historico.motor, descricao: historico.descricao, contagem, maxDias: RETENCAO_DIAS });
});
// { consentir: true } · { pausado: bool } · { retencaoDias: 7|30|90 }
app.post("/api/privacidade", async (req, res) => {
  const { consentir, pausado, retencaoDias } = req.body || {};
  try {
    if (consentir === true && !privacidade.consentimento) {
      privacidade.consentimento = { ts: Date.now() };
      historico.evento("privacidade", "painel", "consentimento registrado");
    }
    if (pausado !== undefined) { privacidade.pausado = !!pausado; historico.pausar(!!pausado, "painel"); }
    if (retencaoDias !== undefined) {
      const d = Number(retencaoDias);
      if (!Number.isFinite(d) || d < 1 || d > RETENCAO_DIAS) return res.status(400).json({ ok: false, error: `Retenção entre 1 e ${RETENCAO_DIAS} dias.` });
      await historico.setRetencao(d);
      privacidade.retencaoDias = historico.retencao;
      historico.evento("privacidade", "painel", `retenção de ${historico.retencao} dias`);
    }
    await historico.salvarConfig("privacidade", privacidade);
    state.privacidade = resumoPrivacidade();
    broadcast();
    res.json({ ok: true, ...resumoPrivacidade() });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});
app.post("/api/privacidade/apagar", async (req, res) => {
  if ((req.body || {}).confirmar !== "APAGAR") return res.status(400).json({ ok: false, error: 'Confirme com {"confirmar":"APAGAR"}.' });
  try {
    await historico.apagar("painel");
    console.log("[privacidade] histórico apagado pelo painel");
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});
// direito de acesso: tudo o que está guardado, em JSON
app.get("/api/privacidade/exportar", async (_req, res) => {
  const ate = Date.now(), desde = ate - historico.retencao * DIA_MS;
  try {
    const [l, e] = await Promise.all([
      historico.leituras({ desde, ate, pinos: [...new Set([...PINS, "V0", "V20", "V21", "V22", "V23", "V24", "V25", "V26"])] }),
      historico.eventos({ desde, ate, limite: 100000 }),
    ]);
    const nome = `casa-inteligente-dados-${new Date(ate).toISOString().slice(0, 10)}.json`;
    res.set("Content-Disposition", `attachment; filename="${nome}"`);
    res.json({ exportadoEm: new Date(ate).toISOString(), retencaoDias: historico.retencao, leituras: l.pinos, eventos: e.eventos.reverse() });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
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

// ------------------------------------------------------------------
// Consumo de energia e economia (I3) — cálculo em server/consumo.js a partir do histórico
// ------------------------------------------------------------------
const consumo = require("./server/consumo");
const CONSUMO = {
  // o carregador usa a mesma potência do server/carregador.js (CARREGADOR_KW)
  potencias: { ...consumo.lerPares(process.env.CONSUMO_W, consumo.POTENCIA_PADRAO), carregador: CARREGADOR_KW * 1000 },
  tarifa: Number(process.env.TARIFA_KWH) > 0 ? Number(process.env.TARIFA_KWH) : 0.85,
  fatores: consumo.lerPares(process.env.TARIFA_BRANCA, consumo.FATOR_BRANCA_PADRAO),
  // padrão de uma casa pequena com carro elétrico (só as luzes ficam em ~10 kWh; o carro, ~120 kWh)
  metaMensal: Number(process.env.META_MENSAL_KWH) > 0 ? Number(process.env.META_MENSAL_KWH) : 150,
};
async function calcularConsumo() {
  const agora = Date.now();
  const mes0 = new Date(agora); mes0.setDate(1); mes0.setHours(0, 0, 0, 0);
  const hoje0 = new Date(agora); hoje0.setHours(0, 0, 0, 0);
  // o mês todo e, no mínimo, 14 dias (para comparar com a semana anterior)
  const desde = Math.max(Math.min(mes0.getTime(), hoje0.getTime() - 13 * DIA_MS), agora - RETENCAO_DIAS * DIA_MS);
  const leituras = await historico.leituras({ desde, ate: agora, pinos: ["V0", ...Object.values(consumo.COMODOS), consumo.CARREGADOR] });
  return consumo.calcular(leituras, { ...CONSUMO, agora });
}
app.get("/api/consumo", async (_req, res) => {
  try {
    res.json(await calcularConsumo());
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});
// consumo do dia no V15 do Blynk (só ao vivo e com CONSUMO_V15=1: o datastream precisa existir — K1)
if (MODE === "live" && process.env.CONSUMO_V15 === "1") {
  let avisou = false, enviado = null;
  setInterval(async () => {
    try {
      // só quando muda (cada envio gasta 1 mensagem da cota): com tudo apagado o valor fica parado
      const kWh = (await calcularConsumo()).hoje.kWh.toFixed(2);
      if (kWh !== enviado) { await blynkUpdate("V15", kWh); enviado = kWh; }
    } catch (err) {
      if (!avisou) console.warn(`[consumo] V15 no Blynk: ${err.message}`);
      avisou = true;
    }
  }, 5 * 60000);
}

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
  if (PRESENCA_POLL_MS > 0) setInterval(() => clients.size && pollPresenca(), Math.max(300, PRESENCA_POLL_MS));
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

historico.iniciar()
  .then(() => carregarPrivacidade())
  // B5: ao reiniciar, a "última detecção" vem do histórico (senão a tela ficaria sem ela até o próximo movimento)
  .then(() => historico.eventos({ desde: Date.now() - 7 * DIA_MS, ate: Date.now(), tipos: ["presenca"], limite: 1 }))
  .then((r) => { const ts = r?.eventos?.[0]?.ts; if (ts && !state.presenceAt) state.presenceAt = ts; })
  // V3: bateria, carro na garagem e carregador voltam como estavam
  .then(() => historico.leituras({ desde: Date.now(), ate: Date.now(), pinos: Object.values(PINOS_CARRO) }))
  .then((r) => {
    const v = Object.fromEntries(Object.entries(r.antes).map(([p, [, valor]]) => [p, valor]));
    Object.assign(carroGravado, Object.fromEntries(Object.entries(v).map(([p, x]) => [p, String(x)])));
    state.carro = carregador.restaurar(v);
  })
  .catch((err) => console.warn(`[historico] ao iniciar: ${err.message}`))
  .finally(() => { carroPronto = true; broadcast(); })
  .then(() => rotina.iniciar())
  .then(() => conforto.iniciar())
  .catch((err) => console.warn(`[rotina] ao iniciar: ${err.message}`));
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
