/*
 * Histórico da casa — base do IoB (H3)
 * ------------------------------------------------------------------
 * Guarda as leituras dos pinos virtuais e os eventos (o que aconteceu, quando e quem fez).
 *
 *   DATABASE_URL (modo ao vivo) : Postgres externo (Supabase/Neon). Sobrevive aos reinícios do Render.
 *   sem DATABASE_URL            : memória (some ao reiniciar).
 *   modo demonstração           : sempre memória, para não misturar dados simulados com os reais;
 *                                 começa com 7 dias sintéticos para os gráficos do painel.
 *
 * Regras de gravação:
 *   - leituras: cada pino só quando muda; V4/V5 (DHT11) uma amostra a cada 5 min (o sensor oscila);
 *   - eventos: derivados das mudanças (luz, porta, janela, modo, alarme, presença) + placa online/offline;
 *   - origem: painel (comando pelo /api/command), cena (I4), automatico (regra do firmware),
 *             dispositivo (app do Blynk ou botão da placa), sensor (PIR, buzzer) e sistema;
 *   - no Postgres a escrita vai em lote a cada 5 s; se o banco cair, o servidor segue e tenta de novo.
 */

const AMOSTRA_MS = 5 * 60 * 1000;
const LOTE_MS = 5000;
const RETENCAO_DIAS = 90;
const MAX_FILA = 5000;
const JANELA_COMANDO_MS = 5000; // mudança até 5 s depois de um comando conta como do painel
const DIA_MS = 86400000;

const AMOSTRADOS = ["V4", "V5"];
const SENSORES = new Set(["V8", "V11"]);
// comando → pino onde a placa devolve o resultado (V2 move o servo; o estado volta em V7)
const ESPELHO = { V2: "V7" };

// evento gerado pela mudança de cada pino: [tipo, detalhe] ou null
const EVENTOS = {
  V0: (v) => ["luz", v === "1" ? "ligada" : "desligada"],
  V1: (v) => ["porta", v === "1" ? "destrancada" : "trancada"],
  V3: (v) => ["modo", v === "1" ? "automatico" : "manual"],
  V7: (v) => ["janela", v === "ABERTA" ? "aberta" : "fechada"],
  V9: (v) => ["alarme", v === "1" ? "armado" : "desarmado"],
  V8: (v, antes) => (/ATIVO/.test(v) && !/ATIVO/.test(antes) ? ["alarme", "disparado"] : null),
  V11: (v) => (v === "1" ? ["presenca", "detectada"] : null),
  // V3: carregador do carro (pinos só do histórico, gravados pelo server.js)
  V24: (v) => ["carregador", v === "1" ? "carregando" : "parado"],
  V26: (v) => ["carro", v === "1" ? "chegou" : "saiu"],
};

// números viram number na resposta (gráficos); textos como "ABERTA" ficam como estão
const num = (v) => (v !== "" && Number.isFinite(Number(v)) ? Number(v) : v);

// ------------------------------------------------------------------
// Motor em memória
// ------------------------------------------------------------------
function motorMemoria() {
  let leituras = [];
  let eventos = [];
  const config = new Map();
  const entre = (x, desde, ate) => x.ts >= desde && x.ts <= ate;
  return {
    nome: "memoria",
    async iniciar() {},
    async gravar(ls, es) {
      leituras.push(...ls);
      eventos.push(...es);
    },
    async leituras(desde, ate, pinos) {
      const quer = new Set(pinos);
      return leituras.filter((l) => quer.has(l.pino) && entre(l, desde, ate));
    },
    async ultimasAntes(desde, pinos) {
      const ult = {};
      for (const l of leituras) if (l.ts < desde && pinos.includes(l.pino)) ult[l.pino] = l;
      return Object.values(ult);
    },
    async eventos(desde, ate, tipos, limite) {
      const out = [];
      for (let i = eventos.length - 1; i >= 0 && out.length < limite; i--) {
        const e = eventos[i];
        if (entre(e, desde, ate) && (!tipos || tipos.includes(e.tipo))) out.push(e);
      }
      return out;
    },
    async lerConfig(chave) {
      return config.has(chave) ? structuredClone(config.get(chave)) : null;
    },
    async salvarConfig(chave, valor) {
      config.set(chave, structuredClone(valor));
    },
    async podar(dias) {
      const corte = Date.now() - dias * DIA_MS;
      leituras = leituras.filter((l) => l.ts >= corte);
      eventos = eventos.filter((e) => e.ts >= corte);
    },
    async apagar() {
      leituras = [];
      eventos = [];
    },
    async contar() {
      const primeiro = Math.min(leituras[0]?.ts ?? Infinity, eventos[0]?.ts ?? Infinity);
      return { leituras: leituras.length, eventos: eventos.length, desde: Number.isFinite(primeiro) ? primeiro : null };
    },
    async fechar() {},
  };
}

// ------------------------------------------------------------------
// Motor Postgres
// ------------------------------------------------------------------
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS leituras (
  ts    timestamptz NOT NULL,
  pino  text        NOT NULL,
  valor text        NOT NULL
);
CREATE INDEX IF NOT EXISTS leituras_pino_ts ON leituras (pino, ts);
CREATE TABLE IF NOT EXISTS eventos (
  id      bigserial   PRIMARY KEY,
  ts      timestamptz NOT NULL,
  tipo    text        NOT NULL,
  origem  text        NOT NULL,
  detalhe text
);
CREATE INDEX IF NOT EXISTS eventos_ts ON eventos (ts);
-- no Supabase o schema public também sai pela API REST (chave anon): com RLS ligado e sem políticas,
-- ninguém lê por lá; o servidor conecta como dono das tabelas e não é afetado
ALTER TABLE leituras ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
-- preferências que precisam sobreviver ao reinício (rotinas aceitas, modo ausente, limite aprendido, privacidade)
CREATE TABLE IF NOT EXISTS config (
  chave text        PRIMARY KEY,
  valor jsonb       NOT NULL,
  ts    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
`;
const MS = "(extract(epoch FROM ts) * 1000)::float8 AS ts";

function motorPostgres(url) {
  const { Pool } = require("pg");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // Supabase/Neon exigem SSL; o certificado do pooler do Supabase não é de uma CA pública
  const pool = new Pool({ connectionString: url, max: 3, ssl: local ? false : { rejectUnauthorized: false } });
  pool.on("error", (e) => console.warn(`[historico] conexão com o banco: ${e.message}`));
  return {
    nome: "postgres",
    async iniciar() {
      await pool.query(ESQUEMA);
    },
    async gravar(ls, es) {
      // um único comando: leituras e eventos entram juntos ou nenhum entra (sem duplicar ao tentar de novo)
      await pool.query(
        `WITH l AS (
           INSERT INTO leituras (ts, pino, valor)
           SELECT to_timestamp(t / 1000.0), p, v FROM unnest($1::float8[], $2::text[], $3::text[]) AS x(t, p, v)
         )
         INSERT INTO eventos (ts, tipo, origem, detalhe)
         SELECT to_timestamp(t / 1000.0), ti, o, d FROM unnest($4::float8[], $5::text[], $6::text[], $7::text[]) AS y(t, ti, o, d)`,
        [
          ls.map((l) => l.ts), ls.map((l) => l.pino), ls.map((l) => l.valor),
          es.map((e) => e.ts), es.map((e) => e.tipo), es.map((e) => e.origem), es.map((e) => e.detalhe),
        ]
      );
    },
    async leituras(desde, ate, pinos) {
      const r = await pool.query(
        `SELECT pino, ${MS}, valor FROM leituras
         WHERE pino = ANY($1) AND ts >= to_timestamp($2 / 1000.0) AND ts <= to_timestamp($3 / 1000.0)
         ORDER BY leituras.ts`,
        [pinos, desde, ate]
      );
      return r.rows;
    },
    async ultimasAntes(desde, pinos) {
      const r = await pool.query(
        `SELECT DISTINCT ON (pino) pino, ${MS}, valor FROM leituras
         WHERE pino = ANY($1) AND ts < to_timestamp($2 / 1000.0)
         ORDER BY pino, leituras.ts DESC`,
        [pinos, desde]
      );
      return r.rows;
    },
    async eventos(desde, ate, tipos, limite) {
      const r = await pool.query(
        `SELECT ${MS}, tipo, origem, detalhe FROM eventos
         WHERE ts >= to_timestamp($1 / 1000.0) AND ts <= to_timestamp($2 / 1000.0)
           AND ($3::text[] IS NULL OR tipo = ANY($3))
         ORDER BY eventos.ts DESC, id DESC LIMIT $4`,
        [desde, ate, tipos, limite]
      );
      return r.rows;
    },
    async lerConfig(chave) {
      const r = await pool.query("SELECT valor FROM config WHERE chave = $1", [chave]);
      return r.rows[0]?.valor ?? null;
    },
    async salvarConfig(chave, valor) {
      await pool.query(
        "INSERT INTO config (chave, valor, ts) VALUES ($1, $2, now()) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, ts = now()",
        [chave, JSON.stringify(valor)]
      );
    },
    async podar(dias) {
      await pool.query("DELETE FROM leituras WHERE ts < now() - make_interval(days => $1)", [dias]);
      await pool.query("DELETE FROM eventos WHERE ts < now() - make_interval(days => $1)", [dias]);
    },
    async apagar() {
      await pool.query("TRUNCATE leituras, eventos");
    },
    async contar() {
      const r = await pool.query(
        `SELECT (SELECT count(*) FROM leituras)::int AS leituras, (SELECT count(*) FROM eventos)::int AS eventos,
                (SELECT (extract(epoch FROM min(ts)) * 1000)::float8 FROM eventos) AS desde`
      );
      return r.rows[0];
    },
    async fechar() {
      await pool.end();
    },
  };
}

// ------------------------------------------------------------------
// 7 dias sintéticos (modo demonstração) — mesma lógica do firmware, com uma rotina de casa
// ------------------------------------------------------------------
function aleatorio(semente) {
  // mulberry32: sempre os mesmos 7 dias para a mesma semente
  return () => {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function semearDemo(agora, dias = 7) {
  const rnd = aleatorio(20261019);
  const L = [], E = [];
  const s = { V0: "0", V1: "0", V3: "1", V7: "FECHADA", V8: "DESARMADO", V9: "0", V11: "0", V14: "0", V24: "0", V25: "70", V26: "1" };
  // V3: carro elétrico — sai e volta nos dias úteis; carrega à noite (quase sempre fora de ponta)
  const CARGA_PCT = ((2.2 * AMOSTRA_MS) / 3600000 / 40) * 100; // 2,2 kW numa bateria de 40 kWh, por amostra
  let bat = 70, cargaAs = null;
  const muda = (ts, pino, valor) => {
    if (s[pino] === String(valor)) return false;
    s[pino] = String(valor);
    L.push({ ts, pino, valor: String(valor) });
    return true;
  };
  const ev = (ts, tipo, origem, detalhe) => E.push({ ts, tipo, origem, detalhe });

  const inicio = Math.ceil((agora - dias * DIA_MS) / AMOSTRA_MS) * AMOSTRA_MS;
  for (const [p, v] of Object.entries(s)) L.push({ ts: inicio, pino: p, valor: v });

  let dia = -1, r = null;
  for (let t = inicio; t < agora; t += AMOSTRA_MS) {
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    const fds = d.getDay() === 0 || d.getDay() === 6;
    if (d.getDate() !== dia) {
      dia = d.getDate();
      r = {
        calor: -1.5 + rnd() * 4.5, // dias mais quentes passam de 30 °C e a janela abre sozinha
        acordar: fds ? 8.5 + rnd() : 6.4 + rnd() * 0.4,
        sair: fds ? null : 7.4 + rnd() * 0.3,
        voltar: fds ? null : 18 + rnd() * 0.8,
        dormir: 23 + rnd() * 0.8,
        noiteManual: rnd() < (fds ? 0.4 : 0.6), // à noite troca para manual e deixa a luz acesa
        manualIni: 19 + rnd() * 0.5,
        manualFim: 22.3 + rnd() * 0.5,
        cargaNaPonta: rnd() < 0.25, // às vezes liga o carregador assim que chega (horário de ponta)
      };
      muda(t, "V14", 0);
    }
    const em = (hh) => hh !== null && h <= hh && hh < h + AMOSTRA_MS / 3600000;
    const na = (hh) => t + Math.round((hh - h) * 3600000);

    // DHT11: curva do dia com pico às 15h
    const onda = Math.sin((2 * Math.PI * (h - 9)) / 24);
    const temp = 24 + 5 * onda + r.calor + (rnd() - 0.5) * 0.6;
    const umid = Math.min(85, Math.max(35, 60 - 9 * onda + (rnd() - 0.5) * 3));
    L.push({ ts: t, pino: "V4", valor: temp.toFixed(1) }, { ts: t, pino: "V5", valor: String(Math.round(umid)) });

    // rotina
    if (em(r.acordar) && s.V9 === "1") {
      const ts = na(r.acordar);
      muda(ts, "V9", 0); muda(ts, "V8", "DESARMADO"); ev(ts, "alarme", "dispositivo", "desarmado");
    }
    for (const [hh, dur] of [[r.sair, 60000], [r.voltar, 120000]]) {
      if (!em(hh)) continue;
      const ts = na(hh);
      muda(ts, "V1", 1); ev(ts, "porta", "dispositivo", "destrancada");
      muda(ts + dur, "V1", 0); ev(ts + dur, "porta", "dispositivo", "trancada");
    }
    if (r.noiteManual && em(r.manualIni)) {
      const ts = na(r.manualIni);
      muda(ts, "V3", 0); ev(ts, "modo", "painel", "manual");
      muda(ts + 20000, "V0", 1); ev(ts + 20000, "luz", "painel", "ligada");
    }
    if (r.noiteManual && em(r.manualFim)) {
      const ts = na(r.manualFim);
      muda(ts, "V0", 0); ev(ts, "luz", "painel", "desligada");
      muda(ts + 20000, "V3", 1); ev(ts + 20000, "modo", "painel", "automatico");
    }
    if (em(r.dormir)) {
      const ts = na(r.dormir);
      muda(ts, "V9", 1); muda(ts, "V8", "ARMADO"); ev(ts, "alarme", "painel", "armado");
    }

    // presença: mais provável com alguém em casa e acordado
    const acordado = h >= r.acordar && h < r.dormir;
    const fora = r.sair !== null && h >= r.sair && h < r.voltar;
    const p = fora ? 0 : acordado ? 0.35 : 0.03;
    if (rnd() < p) {
      const ts = t + Math.round(rnd() * AMOSTRA_MS * 0.8);
      const fim = ts + 8000 + Math.round(rnd() * 40000); // retenção de 8 s do firmware + permanência
      muda(ts, "V11", 1); ev(ts, "presenca", "sensor", "detectada");
      muda(ts, "V14", Number(s.V14) + 1);
      if (s.V3 === "1" && (h >= 18 || h < 6.5)) {
        muda(ts + 300, "V0", 1); ev(ts + 300, "luz", "automatico", "ligada");
        muda(fim, "V0", 0); ev(fim, "luz", "automatico", "desligada");
      }
      if (s.V9 === "1") {
        muda(ts + 200, "V8", "ALARME ATIVO"); ev(ts + 200, "alarme", "sensor", "disparado");
        muda(ts + 4200, "V8", "ARMADO");
      }
      muda(fim, "V11", 0);
    }

    // carro: sai de manhã (a carga para), volta à tarde com a bateria mais baixa e carrega
    if (em(r.sair)) {
      const ts = na(r.sair);
      if (s.V24 === "1") { muda(ts, "V24", 0); ev(ts, "carregador", "automatico", "parado"); }
      muda(ts, "V26", 0); ev(ts, "carro", "cena", "saiu"); // no app o carro só se move pelas cenas Saí e Cheguei
      cargaAs = null;
    }
    if (em(r.voltar)) {
      const ts = na(r.voltar);
      bat = Math.max(10, bat - 3 - (r.voltar - r.sair)); // mesmo gasto do server/carregador.js
      muda(ts, "V26", 1); ev(ts, "carro", "cena", "chegou");
      muda(ts, "V25", Math.floor(bat));
      if (bat < 60) cargaAs = r.cargaNaPonta ? ts + 60000 : null;
      if (bat < 60 && !r.cargaNaPonta) { ev(ts + 60000, "carregador", "painel", "aguardando fora de ponta"); cargaAs = na(22); }
    }
    if (cargaAs !== null && s.V26 === "1" && s.V24 === "0" && t + AMOSTRA_MS > cargaAs && bat < 100) {
      const ts = Math.max(t, cargaAs);
      muda(ts, "V24", 1); ev(ts, "carregador", r.cargaNaPonta && h < 22 ? "painel" : "automatico", "carregando");
    }
    if (s.V24 === "1") {
      bat = Math.min(100, bat + CARGA_PCT);
      muda(t, "V25", Math.floor(bat));
      if (bat >= 100) { muda(t, "V24", 0); ev(t, "carregador", "automatico", "parado"); cargaAs = null; }
    }

    // I6: em casa e com calor antes dos 30 °C, às vezes abre a janela na mão (passa para o manual);
    // quando refresca, fecha e volta ao automático — o conforto adaptativo aprende com isso
    if (!fora && acordado && h >= 11 && h < 18 && s.V3 === "1" && s.V7 === "FECHADA" && temp >= 27.6 && temp < 30 && rnd() < 0.2) {
      muda(t, "V3", 0); ev(t, "modo", "painel", "manual");
      muda(t + 15000, "V7", "ABERTA"); ev(t + 15000, "janela", "painel", "aberta");
      r.abriuNaMao = true;
    } else if (r.abriuNaMao && s.V7 === "ABERTA" && temp <= 26.2 && rnd() < 0.5) {
      muda(t, "V7", "FECHADA"); ev(t, "janela", "painel", "fechada");
      muda(t + 15000, "V3", 1); ev(t + 15000, "modo", "painel", "automatico");
      r.abriuNaMao = false;
    }

    // janela no automático: abre ≥ 30 °C, fecha ≤ 27 °C
    if (s.V3 === "1") {
      if (temp >= 30 && s.V7 === "FECHADA") { muda(t, "V7", "ABERTA"); ev(t, "janela", "automatico", "aberta"); }
      else if (temp <= 27 && s.V7 === "ABERTA") { muda(t, "V7", "FECHADA"); ev(t, "janela", "automatico", "fechada"); }
    }
  }
  const ordem = (a, b) => a.ts - b.ts;
  return { leituras: L.filter((l) => l.ts < agora).sort(ordem), eventos: E.filter((e) => e.ts < agora).sort(ordem) };
}

// ------------------------------------------------------------------
// Histórico
// ------------------------------------------------------------------
/**
 * @param {object} o
 * @param {string} [o.url]     DATABASE_URL (ignorada no modo demonstração)
 * @param {boolean} o.demo     modo demonstração
 * @param {() => object} o.valores  valores atuais dos pinos (state.values)
 * @param {() => number|null} o.lidoEm  hora da última leitura bem-sucedida (state.readAt)
 */
function criarHistorico({ url, demo, valores, lidoEm }) {
  const motor = url && !demo ? motorPostgres(url) : motorMemoria();
  const descricao = motor.nome === "postgres"
    ? "Postgres (DATABASE_URL)"
    : demo
      ? `memória com 7 dias sintéticos${url ? " (a demonstração não grava no banco)" : ""}`
      : "memória (some ao reiniciar — defina DATABASE_URL)";

  const fila = { leituras: [], eventos: [] };
  const comandos = new Map(); // pino → { ts, origem } do último comando
  const ouvintes = new Set();
  const timers = [];
  let pronto = false, gravando = false, falhou = false, ultimaAmostra = 0, ultimoTs = 0;
  // I8: coleta pausada (nada novo é gravado; a casa continua funcionando) e retenção configurável
  let pausado = false, retencao = RETENCAO_DIAS;
  // relógio que nunca repete: duas mudanças no mesmo milissegundo saem em ordem do banco (empate no ts não tem ordem)
  const relogio = () => (ultimoTs = Math.max(Date.now(), ultimoTs + 1));

  function evento(tipo, origem, detalhe, ts = relogio()) {
    const e = { ts, tipo, origem, detalhe };
    if (pausado) return e;
    fila.eventos.push(e);
    for (const f of ouvintes) f(e);
    return e;
  }

  function origemDe(pino, v, agora) {
    const c = comandos.get(pino);
    if (c && agora - c.ts < JANELA_COMANDO_MS) return c.origem;
    if (SENSORES.has(pino)) return "sensor";
    if ((pino === "V0" || pino === "V7") && v.V3 === "1") return "automatico";
    if (pino === "V24") return "automatico"; // sem comando: horário fora de ponta, bateria cheia, carro saiu
    return "dispositivo";
  }

  /** Chamado pelo servidor a cada mudança de estado: `mudou` = pinos novos, `antes` = valores anteriores. */
  function registrar(mudou, antes) {
    if (pausado) return;
    const agora = relogio(), v = valores();
    for (const [pino, valor] of Object.entries(mudou)) {
      if (!AMOSTRADOS.includes(pino)) fila.leituras.push({ ts: agora, pino, valor });
      // primeira leitura de um pino (ex.: logo após iniciar) só grava o valor, sem evento
      if (antes[pino] === undefined) continue;
      const e = EVENTOS[pino]?.(valor, antes[pino]);
      if (e) evento(e[0], origemDe(pino, v, agora), e[1], agora);
    }
  }

  /** Marca um comando enviado (painel ou cena) para atribuir a origem das mudanças seguintes. */
  function comando(pino, origem = "painel") {
    comandos.set(ESPELHO[pino] || pino, { ts: Date.now(), origem });
  }

  function amostrar() {
    if (pausado) return;
    const agora = relogio(), lido = lidoEm();
    // só com leitura recente: sem página aberta e sem consulta de fundo o valor estaria velho
    if (agora - ultimaAmostra < AMOSTRA_MS || !lido || agora - lido > AMOSTRA_MS) return;
    const v = valores();
    let gravou = false;
    for (const p of AMOSTRADOS) {
      if (v[p] === undefined || v[p] === "") continue;
      fila.leituras.push({ ts: agora, pino: p, valor: v[p] });
      gravou = true;
    }
    if (gravou) ultimaAmostra = agora;
  }

  async function descarregar() {
    if (gravando || (!fila.leituras.length && !fila.eventos.length && pronto)) return;
    gravando = true;
    const ls = fila.leituras.splice(0), es = fila.eventos.splice(0);
    try {
      if (!pronto) { await motor.iniciar(); pronto = true; }
      if (ls.length || es.length) await motor.gravar(ls, es);
      if (falhou) console.log("[historico] banco de volta, fila gravada");
      falhou = false;
    } catch (e) {
      fila.leituras.unshift(...ls);
      fila.eventos.unshift(...es);
      // banco fora por muito tempo: descarta o mais antigo para não estourar a memória
      if (fila.leituras.length > MAX_FILA) fila.leituras.splice(0, fila.leituras.length - MAX_FILA);
      if (fila.eventos.length > MAX_FILA) fila.eventos.splice(0, fila.eventos.length - MAX_FILA);
      if (!falhou) console.warn(`[historico] falha ao gravar (tento de novo a cada ${LOTE_MS / 1000} s): ${e.message}`);
      falhou = true;
    } finally {
      gravando = false;
    }
  }

  async function iniciar() {
    if (demo) {
      const s = semearDemo(Date.now());
      await motor.gravar(s.leituras, s.eventos);
      // o estado atual da demonstração vira a última leitura de cada pino
      registrar({ ...valores() }, {});
      ultimaAmostra = 0;
    }
    await descarregar();
    await motor.podar(retencao).catch(() => {});
    timers.push(
      setInterval(descarregar, LOTE_MS),
      setInterval(amostrar, 30000),
      setInterval(() => motor.podar(retencao).catch(() => {}), DIA_MS)
    );
    for (const t of timers) t.unref();
  }

  /** Leituras por pino no período, mais o último valor de cada pino antes de `desde` (estado inicial). */
  async function leituras({ desde, ate, pinos }) {
    await descarregar();
    if (falhou) throw new Error("Banco do histórico indisponível.");
    const [linhas, antes] = await Promise.all([motor.leituras(desde, ate, pinos), motor.ultimasAntes(desde, pinos)]);
    const out = Object.fromEntries(pinos.map((p) => [p, []]));
    for (const l of linhas) out[l.pino]?.push([l.ts, num(l.valor)]);
    return {
      motor: motor.nome, desde, ate, pinos: out,
      antes: Object.fromEntries(antes.map((l) => [l.pino, [l.ts, num(l.valor)]])),
    };
  }

  /** Eventos do período, do mais novo para o mais antigo. */
  async function eventos({ desde, ate, tipos = null, limite = 200 }) {
    await descarregar();
    if (falhou) throw new Error("Banco do histórico indisponível.");
    return { motor: motor.nome, desde, ate, eventos: await motor.eventos(desde, ate, tipos, limite) };
  }

  /** Preferências persistentes (tabela config): null se não existir; nunca derruba quem chamou. */
  async function lerConfig(chave) {
    if (!pronto) await descarregar();
    try { return await motor.lerConfig(chave); } catch (e) { console.warn(`[historico] config ${chave}: ${e.message}`); return null; }
  }
  async function salvarConfig(chave, valor) {
    try { await motor.salvarConfig(chave, valor); return true; } catch (e) { console.warn(`[historico] config ${chave}: ${e.message}`); return false; }
  }

  // ---------- privacidade (I8) ----------
  /** Pausa/retoma a coleta. Ao retomar, o estado atual vira a última leitura de cada pino (os gráficos seguem certos). */
  function pausar(sim, origem = "painel", registrarEvento = true) {
    if (pausado === !!sim) return;
    if (sim) { if (registrarEvento) evento("privacidade", origem, "coleta pausada"); pausado = true; fila.leituras.length = 0; return; }
    pausado = false;
    evento("privacidade", origem, "coleta retomada");
    const v = valores();
    for (const [pino, valor] of Object.entries(v)) if (!AMOSTRADOS.includes(pino)) fila.leituras.push({ ts: relogio(), pino, valor });
    ultimaAmostra = 0;
  }
  async function setRetencao(dias) {
    retencao = Math.min(RETENCAO_DIAS, Math.max(1, Math.round(dias)));
    await motor.podar(retencao);
  }
  /** Apaga leituras e eventos (o banco inteiro do histórico). Fica só o registro de que foi apagado. */
  async function apagar(origem = "painel") {
    await descarregar();
    fila.leituras.length = 0;
    fila.eventos.length = 0;
    await motor.apagar();
    // o estado atual volta como ponto de partida, para os gráficos não começarem do nada
    if (!pausado) {
      const v = valores();
      for (const [pino, valor] of Object.entries(v)) if (!AMOSTRADOS.includes(pino)) fila.leituras.push({ ts: relogio(), pino, valor });
    }
    const e = { ts: relogio(), tipo: "privacidade", origem, detalhe: "histórico apagado" };
    fila.eventos.push(e);
    for (const f of ouvintes) f(e);
    await descarregar();
  }
  async function contar() {
    await descarregar();
    return motor.contar();
  }

  async function fechar() {
    timers.forEach(clearInterval);
    await descarregar();
    await motor.fechar();
  }

  return {
    motor: motor.nome, descricao,
    iniciar, registrar, comando, evento, amostrar, descarregar, leituras, eventos, lerConfig, salvarConfig, fechar,
    pausar, setRetencao, apagar, contar,
    get pausado() { return pausado; }, get retencao() { return retencao; },
    aoEvento: (f) => ouvintes.add(f),
  };
}

module.exports = { criarHistorico, semearDemo, RETENCAO_DIAS };
