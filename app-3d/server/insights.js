/*
 * Insights diários e alertas (I7)
 * ------------------------------------------------------------------
 * Insights: resumo de um dia a partir do histórico (H3) — detecções e pico de presença, tempo de luz ligada,
 * janela aberta N×, alarme, cenas, consumo (I3) e carro (V3) — comparado com a média dos 7 dias anteriores,
 * e frases curtas que contam o dia.
 *
 * Alertas (avaliados a cada 5 s com o estado atual):
 *   - porta destrancada há mais de 10 min            → ação: trancar
 *   - movimento com o alarme armado (buzzer disparou) → ação: desarmar
 *   - temperatura ≥ 30 °C com a janela fechada no manual (há 2 min) → ação: abrir a janela
 *   - NodeMCU offline há mais de 2 min (modo ao vivo)
 *   - bateria do carro abaixo de 20 % sem carregar    → ação: ligar o carregador
 * Cada alerta novo vira evento "alerta" no histórico. "Ok" silencia até a condição acabar.
 * O push pelo Blynk (eventos/notificações, K3) fica para o bloco do Blynk.
 */

const DIA_MS = 86400000, MIN = 60000;
const PORTA_MS = 10 * MIN, CALOR_MS = 2 * MIN, OFFLINE_MS = 2 * MIN, INVASAO_MS = 30 * MIN;

const inicioDoDia = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const duracao = (ms) => { const m = Math.round(ms / MIN); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`; };

/** Tempo (ms) com o pino em "1" entre ini e fim, a partir das leituras em degraus. */
function tempoLigado(pts = [], antes, ini, fim) {
  let v = Number(antes?.[1]) === 1, t = ini, total = 0;
  for (const [ts, x] of pts) {
    if (ts < ini) { v = Number(x) === 1; continue; }
    if (ts > fim) break;
    if (v) total += ts - t;
    v = Number(x) === 1; t = ts;
  }
  if (v) total += Math.max(0, fim - t);
  return total;
}

/**
 * Números de um dia [ini, fim) — eventos e leituras do V0 que cobrem o período.
 */
function numerosDoDia({ eventos, v0, ini, fim }) {
  const doDia = eventos.filter((e) => e.ts >= ini && e.ts < fim);
  const pres = doDia.filter((e) => e.tipo === "presenca");
  const porHora = Array(24).fill(0);
  for (const e of pres) porHora[new Date(e.ts).getHours()]++;
  const max = Math.max(...porHora);
  return {
    deteccoes: pres.length,
    porHora,
    pico: max > 0 ? { hora: porHora.indexOf(max), n: max } : null,
    luzMs: tempoLigado(v0.pts, v0.antes, ini, fim),
    janelaAberta: doDia.filter((e) => e.tipo === "janela" && e.detalhe === "aberta").length,
    janelaAuto: doDia.filter((e) => e.tipo === "janela" && e.detalhe === "aberta" && e.origem === "automatico").length,
    disparos: doDia.filter((e) => e.tipo === "alarme" && e.detalhe === "disparado").length,
    cenas: doDia.filter((e) => e.tipo === "cena").length,
    alertas: doDia.filter((e) => e.tipo === "alerta").length,
  };
}

/**
 * Insights de um dia: números, média dos 7 dias anteriores e frases.
 * eventos/v0 cobrem de (dia − 7) até o fim do dia; consumoDia = { kWh, reais, porComodo } do I3 (opcional).
 */
function insights({ eventos, v0, dia, agora = Date.now(), consumoDia = null }) {
  const ini = inicioDoDia(dia), fim = Math.min(ini + DIA_MS, agora);
  const hoje = numerosDoDia({ eventos, v0, ini, fim });
  // média dos 7 dias anteriores, só dos dias que têm algum dado
  const anteriores = [];
  for (let k = 1; k <= 7; k++) {
    const a = ini - k * DIA_MS;
    const n = numerosDoDia({ eventos, v0, ini: a, fim: a + DIA_MS });
    if (n.deteccoes || n.luzMs || n.cenas) anteriores.push(n);
  }
  const media = (f) => (anteriores.length ? anteriores.reduce((s, n) => s + f(n), 0) / anteriores.length : null);
  const base = { deteccoes: media((n) => n.deteccoes), luzMs: media((n) => n.luzMs), dias: anteriores.length };
  // dia em andamento: compara com a média proporcional às horas passadas
  const fracao = (fim - ini) / DIA_MS;

  const frases = [];
  const pct = (a, b) => Math.round(((a - b) / b) * 100);
  if (hoje.deteccoes) {
    let f = `${hoje.deteccoes} ${hoje.deteccoes === 1 ? "detecção" : "detecções"} no PIR`;
    if (hoje.pico) f += `, a maioria às ${hoje.pico.hora}h (${hoje.pico.n})`;
    if (base.deteccoes) {
      const p = pct(hoje.deteccoes, base.deteccoes * fracao);
      if (Math.abs(p) >= 20) f += ` — ${Math.abs(p)}% ${p > 0 ? "mais" : "menos"} movimento que o normal`;
    }
    frases.push(f + ".");
  } else frases.push("Nenhum movimento no PIR: a casa ficou vazia.");
  if (hoje.luzMs >= MIN) {
    let f = `Luz geral ligada por ${duracao(hoje.luzMs)}`;
    if (base.luzMs) {
      const dif = hoje.luzMs - base.luzMs * fracao;
      if (Math.abs(dif) >= 20 * MIN) f += ` (${duracao(Math.abs(dif))} ${dif > 0 ? "a mais" : "a menos"} que a média)`;
    }
    frases.push(f + ".");
  }
  if (hoje.janelaAberta) {
    const manual = hoje.janelaAberta - hoje.janelaAuto;
    frases.push(`A janela abriu ${hoje.janelaAberta}× (${hoje.janelaAuto} pela regra do calor${manual ? `, ${manual} na mão` : ""}).`);
  }
  if (hoje.disparos) frases.push(`O alarme disparou ${hoje.disparos}× — confira a linha do tempo.`);
  if (consumoDia && consumoDia.kWh > 0) {
    const carro = consumoDia.porComodo?.carregador || 0;
    frases.push(`Energia: ${consumoDia.kWh.toFixed(2).replace(".", ",")} kWh (R$ ${consumoDia.reais.toFixed(2).replace(".", ",")})` +
      (carro / consumoDia.kWh >= 0.3 ? `, ${Math.round((carro / consumoDia.kWh) * 100)}% foi o carro.` : "."));
  }
  return { dia: ini, ate: fim, emAndamento: fim < ini + DIA_MS, ...hoje, media: base, consumo: consumoDia, frases };
}

// ------------------------------------------------------------------
// Alertas
// ------------------------------------------------------------------
/**
 * Avalia as condições. `memo` guarda desde quando cada condição vale (entre chamadas).
 * s: state do servidor · agora · → lista de alertas ativos (sem os silenciados)
 */
function avaliar(s, memo, agora = Date.now()) {
  const v = s.values || {};
  const desde = (id, cond) => {
    if (!cond) { delete memo[id]; return null; }
    return (memo[id] ??= agora);
  };
  const out = [];
  const porta = desde("porta", v.V1 === "1");
  if (porta !== null && agora - porta >= PORTA_MS) {
    out.push({ id: "porta", nivel: "aviso", titulo: "Porta destrancada", texto: `A porta está destrancada há ${duracao(agora - porta)}.`, acao: { rotulo: "Trancar", pino: "V1", valor: 0 }, desde: porta });
  }
  // invasão: o buzzer dispara por 4 s; o alerta fica até alguém ver (ou 30 min)
  if (/ATIVO/.test(v.V8 || "")) memo.invasao = agora;
  if (memo.invasao !== undefined && agora - memo.invasao < INVASAO_MS && v.V9 === "1") {
    out.push({ id: "invasao", nivel: "critico", titulo: "Movimento com o alarme armado", texto: "O PIR detectou alguém e o buzzer disparou.", acao: { rotulo: "Desarmar", pino: "V9", valor: 0 }, desde: memo.invasao });
  } else if (v.V9 !== "1") delete memo.invasao;
  const calor = desde("calor", Number(v.V4) >= 30 && v.V7 === "FECHADA" && v.V3 === "0");
  if (calor !== null && agora - calor >= CALOR_MS) {
    out.push({ id: "calor", nivel: "aviso", titulo: "Calor com a janela fechada", texto: `${Number(v.V4).toFixed(1).replace(".", ",")} °C e a janela fechada no modo manual (o automático abriria).`, acao: { rotulo: "Abrir a janela", pino: "V2", valor: 1 }, desde: calor });
  }
  const off = desde("offline", s.mode === "live" && !s.deviceOnline);
  if (off !== null && agora - off >= OFFLINE_MS) {
    out.push({ id: "offline", nivel: "aviso", titulo: "NodeMCU offline", texto: `A placa não fala com o Blynk há ${duracao(agora - off)}.`, desde: off });
  }
  const c = s.carro;
  if (c && c.naGaragem && c.bateria < 20 && !c.carregando && !c.aguardando) {
    out.push({ id: "bateria", nivel: "info", titulo: `Carro com ${Math.floor(c.bateria)}% de bateria`, texto: "Está na garagem e não está carregando.", acao: { rotulo: "Carregar", carregador: true }, desde: desde("bateria", true) });
  } else delete memo.bateria;
  return out;
}

/** Serviço: historico · estado() · executar(acao) · aoMudar() */
function criarAlertas({ historico, estado, executar, aoMudar }) {
  const memo = {};
  const silenciados = new Set();
  const vistos = new Set();
  let ativos = [], assinatura = "";

  function tick(agora = Date.now()) {
    const todos = avaliar(estado(), memo, agora);
    const ids = new Set(todos.map((a) => a.id));
    // condição acabou: libera o silêncio e permite avisar de novo
    for (const id of [...silenciados]) if (!ids.has(id)) silenciados.delete(id);
    for (const id of [...vistos]) if (!ids.has(id)) vistos.delete(id);
    for (const a of todos) {
      if (!vistos.has(a.id)) { vistos.add(a.id); historico.evento("alerta", "sistema", a.titulo); }
    }
    ativos = todos.filter((a) => !silenciados.has(a.id));
    // o texto muda com o tempo ("há 12 min"): broadcast só quando muda a lista
    const sig = ativos.map((a) => a.id).join(",");
    if (sig !== assinatura) { assinatura = sig; aoMudar(); }
  }

  async function responder(id, resposta) {
    const a = ativos.find((x) => x.id === id);
    if (!a) throw Object.assign(new Error("Alerta não está mais ativo."), { status: 404 });
    if (resposta === "executar" && a.acao) await executar(a.acao);
    silenciados.add(id);
    if (id === "invasao") delete memo.invasao;
    tick();
  }

  return {
    iniciar() { setInterval(() => tick(), 5000).unref(); tick(); },
    responder, tick,
    lista: () => ativos,
  };
}

module.exports = { insights, numerosDoDia, tempoLigado, avaliar, criarAlertas, inicioDoDia };
