/*
 * Rotina aprendida e modo ausente (I5) — o IoB observando o comportamento e sugerindo ações.
 * ------------------------------------------------------------------
 * Aprende com o histórico (H3):
 *   - saída e chegada típicas por dia da semana: pelo carro (V3, eventos "carro") e, sem ele, pelo maior
 *     intervalo sem presença no PIR durante o dia (≥ 3 h);
 *   - padrão das luzes por hora (fração do tempo com cada cômodo aceso nos últimos dias).
 * Sugere (o usuário aceita ou dispensa no painel):
 *   - acender a luz externa 10 min antes da chegada típica (vira uma automação);
 *   - armar o alarme 15 min depois da saída típica, se ninguém estiver em casa (automação);
 *   - sem presença há 2 h ou mais: armar o alarme agora / ligar o modo ausente.
 * Modo ausente: simula a casa ocupada acendendo e apagando os cômodos no padrão aprendido (anti-furto).
 * O tempo em modo ausente fica de fora do aprendizado (senão a simulação aprenderia a si mesma).
 */

const DIA_MS = 86400000, H = 3600000, MIN = 60000;
const LACUNA_MS = 3 * H; // casa vazia: pelo menos 3 h sem presença
const AUSENTE_MS = 2 * H; // sem presença há 2 h ⇒ sugere armar / modo ausente
const LIMIAR_LUZ = 0.35; // no modo ausente o cômodo acende na hora em que ficou aceso ≥ 35 % do tempo
const COMODOS = { sala: "V20", cozinha: "V21", quarto: "V22", externa: "V23" };
const UTEIS = [1, 2, 3, 4, 5], FDS = [0, 6];

const minutos = (ts) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
const hhmm = (m) => (m === null || m === undefined ? null : `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`);
const inicioDoDia = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};

/**
 * Saída e chegada de cada dia, a partir das presenças (ts) e dos eventos do carro ({ ts, detalhe }).
 * Hoje fica de fora (o dia ainda não terminou).
 */
function diasObservados({ presencas = [], carro = [], agora = Date.now(), dias = 14 }) {
  const hoje0 = inicioDoDia(agora);
  const out = [];
  for (let d0 = hoje0 - dias * DIA_MS; d0 < hoje0; d0 += DIA_MS) {
    // horário de verão não existe mais no Brasil, mas o dia pode ter 23/25 h em outros fusos: recalcula o início
    const ini = inicioDoDia(d0 + 2 * H), fim = ini + DIA_MS;
    const ps = presencas.filter((t) => t >= ini && t < fim).sort((a, b) => a - b);
    const cs = carro.filter((e) => e.ts >= ini && e.ts < fim).sort((a, b) => a.ts - b.ts);
    let saida = null, chegada = null, fonte = null;
    const saiu = cs.find((e) => e.detalhe === "saiu" && minutos(e.ts) >= 5 * 60 && minutos(e.ts) < 14 * 60);
    if (saiu) {
      const volta = cs.find((e) => e.detalhe === "chegou" && e.ts > saiu.ts && minutos(e.ts) >= 11 * 60);
      saida = minutos(saiu.ts); chegada = volta ? minutos(volta.ts) : null; fonte = "carro";
    } else {
      // maior intervalo sem presença começando entre 6h e 15h
      let melhor = null;
      const marcos = [ini + 6 * H, ...ps.filter((t) => t > ini + 6 * H), Math.min(fim, agora)];
      for (let i = 1; i < marcos.length; i++) {
        const a = marcos[i - 1], b = marcos[i];
        if (b - a >= LACUNA_MS && minutos(a) < 15 * 60 && (!melhor || b - a > melhor[1] - melhor[0])) melhor = [a, b];
      }
      // o intervalo precisa ter presença antes (alguém saiu) e terminar de tarde/noite (alguém chegou)
      if (melhor && ps.some((t) => t <= melhor[0]) && minutos(melhor[1]) >= 11 * 60 && melhor[1] < fim) {
        saida = minutos(melhor[0]); chegada = minutos(melhor[1]); fonte = "presenca";
      }
    }
    out.push({ dia: new Date(ini).getDay(), data: ini, saida, chegada, fonte, presencas: ps.length });
  }
  return out;
}

/** Saída/chegada típicas (mediana) por dia da semana, nos dias úteis e no fim de semana. */
function aprender(entrada) {
  const dias = diasObservados(entrada);
  const grupo = (lista) => {
    const ds = dias.filter((d) => lista.includes(d.dia) && d.saida !== null);
    return { saida: mediana(ds.map((d) => d.saida)), chegada: mediana(ds.filter((d) => d.chegada !== null).map((d) => d.chegada)), amostras: ds.length };
  };
  const porDia = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, ...grupo([dia]) }));
  return { porDia, uteis: grupo(UTEIS), fds: grupo(FDS), dias: dias.length };
}

/**
 * Fração do tempo com cada cômodo aceso, por hora do dia, a partir das leituras do histórico
 * (V20–V23; antes do 1º registro do cômodo, o V0 — mesma regra do consumo). `fora` = intervalos [a, b]
 * ignorados (modo ausente ligado).
 */
function padraoLuzes(leituras, fora = []) {
  const { desde, ate, pinos = {}, antes = {} } = leituras;
  const num = (v) => Number(v);
  const serie = (pts, inicial) => { let i = 0, v = inicial; return (t) => { while (i < pts.length && pts[i][0] <= t) v = pts[i++][1]; return v; }; };
  const v0 = serie((pinos.V0 || []).map(([t, v]) => [t, num(v) === 1 ? 1 : 0]), num(antes.V0?.[1]) === 1 ? 1 : 0);
  const nivel = {};
  for (const [k, p] of Object.entries(COMODOS)) {
    const pts = (pinos[p] || []).map(([t, v]) => [t, num(v) > 0 ? 1 : 0]);
    const inicio = antes[p] ? -Infinity : pts.length ? pts[0][0] : Infinity;
    const proprio = serie(pts, antes[p] && num(antes[p][1]) > 0 ? 1 : 0);
    nivel[k] = (t) => { const g = v0(t), x = proprio(t); return t < inicio ? g : x; };
  }
  const soma = Object.fromEntries(Object.keys(COMODOS).map((k) => [k, Array(24).fill(0)]));
  const n = Array(24).fill(0);
  const PASSO = 10 * MIN;
  // só a partir do primeiro dado conhecido (antes disso o histórico não existia: não é "luz apagada")
  const conhecidos = [...Object.values(antes).map((a) => a[0]), ...Object.values(pinos).map((p) => p[0]?.[0])].filter(Number.isFinite);
  const inicio = conhecidos.length ? Math.max(desde, Math.min(...conhecidos)) : ate;
  for (let t = Math.ceil(inicio / PASSO) * PASSO; t < ate; t += PASSO) {
    const valores = Object.fromEntries(Object.keys(COMODOS).map((k) => [k, nivel[k](t)])); // avança os ponteiros sempre
    if (fora.some(([a, b]) => t >= a && t < b)) continue;
    const h = new Date(t).getHours();
    n[h]++;
    for (const k of Object.keys(COMODOS)) soma[k][h] += valores[k];
  }
  return Object.fromEntries(Object.entries(soma).map(([k, xs]) => [k, xs.map((x, h) => (n[h] ? Math.round((x / n[h]) * 100) / 100 : 0))]));
}

/** Intervalos com o modo ausente ligado, a partir dos eventos "ausente" (do mais novo ao mais antigo). */
function intervalosAusente(eventos, agora = Date.now()) {
  const evs = [...eventos].sort((a, b) => a.ts - b.ts);
  const out = [];
  let ini = null;
  for (const e of evs) {
    if (e.detalhe === "ligado" && ini === null) ini = e.ts;
    if (e.detalhe === "desligado" && ini !== null) { out.push([ini, e.ts]); ini = null; }
  }
  if (ini !== null) out.push([ini, agora]);
  return out;
}

/**
 * Sugestões a partir da rotina e do estado atual.
 * estado: { alarmeArmado, presenceAt, carroNaGaragem, ausente, automacoes, dispensadas, agora }
 */
function sugerir(rotina, estado) {
  const { agora = Date.now(), alarmeArmado, presenceAt, ausente, automacoes = [], dispensadas = {} } = estado;
  const out = [];
  const ativa = (id) => automacoes.some((a) => a.id === id);
  const dispensada = (id) => dispensadas[id] && agora < dispensadas[id];
  const u = rotina.uteis;
  if (u.chegada !== null && u.amostras >= 2 && !ativa("luz-chegada")) {
    const hora = u.chegada - 10;
    out.push({
      id: "luz-chegada", tipo: "automacao",
      titulo: `Acender a luz externa às ${hhmm(hora)}?`,
      texto: `Nos dias úteis você costuma chegar por volta das ${hhmm(u.chegada)} (${u.amostras} dias observados). A casa acende a entrada 10 min antes, se não houver ninguém.`,
      automacao: { id: "luz-chegada", tipo: "luz", comodo: "externa", nivel: 100, hora: hhmm(hora), dias: UTEIS, descricao: `Luz externa às ${hhmm(hora)} nos dias úteis, com a casa vazia` },
    });
  }
  if (u.saida !== null && u.amostras >= 2 && !ativa("alarme-saida")) {
    const hora = u.saida + 15;
    out.push({
      id: "alarme-saida", tipo: "automacao",
      titulo: `Armar o alarme às ${hhmm(hora)} se a casa estiver vazia?`,
      texto: `Nos dias úteis você costuma sair por volta das ${hhmm(u.saida)}. Se o PIR não vir ninguém por 15 min, o alarme arma sozinho.`,
      automacao: { id: "alarme-saida", tipo: "alarme", hora: hhmm(hora), dias: UTEIS, descricao: `Arma o alarme às ${hhmm(hora)} nos dias úteis, se ninguém estiver em casa` },
    });
  }
  const semPresenca = presenceAt ? agora - presenceAt : null;
  if (semPresenca !== null && semPresenca >= AUSENTE_MS) {
    const horas = Math.floor(semPresenca / H);
    if (!alarmeArmado) {
      out.push({ id: "armar-agora", tipo: "acao", titulo: "Armar o alarme agora?", texto: `Ninguém passou pelo PIR há ${horas} h e o alarme está desarmado.`, acao: { pino: "V9", valor: 1 } });
    }
    if (!ausente) {
      out.push({ id: "ausente-agora", tipo: "ausente", titulo: "Ligar o modo ausente?", texto: `Casa vazia há ${horas} h. As luzes acendem e apagam no seu padrão de costume, para parecer que tem gente.` });
    }
  }
  return out.filter((s) => !dispensada(s.id));
}

/** Automações que devem disparar agora (uma vez por dia cada). `disparadas` = Set de "id:aaaa-mm-dd". */
function devidas(automacoes, agora, disparadas) {
  const d = new Date(agora), m = minutos(agora);
  const chave = (a) => `${a.id}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return automacoes.filter((a) => {
    if (!a.dias.includes(d.getDay()) || disparadas.has(chave(a))) return false;
    const [hh, mm] = a.hora.split(":").map(Number);
    const alvo = hh * 60 + mm;
    return m >= alvo && m < alvo + 30; // até 30 min de atraso (servidor dormindo/reiniciando)
  }).map((a) => ({ ...a, chave: chave(a) }));
}

/** Níveis que o modo ausente quer agora (com um deslocamento de alguns minutos por dia, para não ser mecânico). */
function alvoAusente(padrao, agora) {
  const dia = new Date(agora).getDate();
  return Object.fromEntries(Object.keys(COMODOS).map((k, i) => {
    const deslocamento = ((dia * 7 + i * 11) % 25) * MIN; // 0–24 min, diferente por cômodo e por dia
    const h = new Date(agora - deslocamento).getHours();
    return [k, (padrao[k]?.[h] || 0) >= LIMIAR_LUZ ? 100 : 0];
  }));
}

// ------------------------------------------------------------------
// Serviço: junta o aprendizado ao servidor (histórico, comandos, luzes) e guarda as escolhas na config
// ------------------------------------------------------------------
/**
 * historico: server/history.js · estado(): state do servidor · comandar(pino, valor, origem) · setRoom(cômodo, nível, origem)
 * aoMudar(): sugestões/modo ausente mudaram (o servidor faz broadcast)
 */
function criarRotina({ historico, estado, comandar, setRoom, aoMudar }) {
  let cfg = { automacoes: [], dispensadas: {}, ausente: { ligado: false, desde: null } };
  let rotina = { porDia: [], uteis: { saida: null, chegada: null, amostras: 0 }, fds: { saida: null, chegada: null, amostras: 0 }, dias: 0 };
  let padrao = Object.fromEntries(Object.keys(COMODOS).map((k) => [k, Array(24).fill(0)]));
  let sugestoes = [], aprendidoEm = null, assinatura = "";
  const disparadas = new Set();
  const alvoAplicado = {};

  const salvar = () => historico.salvarConfig("rotina", cfg);

  async function reaprender(agora = Date.now()) {
    const desde = agora - 14 * DIA_MS;
    const [pres, carro, aus, luz] = await Promise.all([
      historico.eventos({ desde, ate: agora, tipos: ["presenca"], limite: 20000 }),
      historico.eventos({ desde, ate: agora, tipos: ["carro"], limite: 1000 }),
      historico.eventos({ desde, ate: agora, tipos: ["ausente"], limite: 1000 }),
      historico.leituras({ desde, ate: agora, pinos: ["V0", ...Object.values(COMODOS)] }),
    ]);
    rotina = aprender({ presencas: pres.eventos.map((e) => e.ts), carro: carro.eventos, agora });
    padrao = padraoLuzes(luz, intervalosAusente(aus.eventos, agora));
    aprendidoEm = agora;
  }

  function atualizarSugestoes(agora = Date.now()) {
    const s = estado();
    sugestoes = sugerir(rotina, {
      agora, alarmeArmado: s.values.V9 === "1", presenceAt: s.presenceAt, ausente: cfg.ausente.ligado,
      automacoes: cfg.automacoes, dispensadas: cfg.dispensadas,
    });
    const a = JSON.stringify([sugestoes.map((x) => x.id + x.titulo), cfg.ausente, cfg.automacoes.map((x) => x.id)]);
    if (a !== assinatura) { assinatura = a; aoMudar(); }
  }

  async function executar(a, agora) {
    const s = estado();
    const vazia = !s.presenceAt || agora - s.presenceAt >= (a.tipo === "alarme" ? 15 : 30) * MIN;
    if (!vazia) return historico.evento("rotina", "rotina", `${a.descricao} — não disparou: havia gente em casa`);
    if (a.tipo === "luz" && Number(s.rooms[a.comodo]) < a.nivel) await setRoom(a.comodo, a.nivel, "rotina");
    if (a.tipo === "alarme" && s.values.V9 !== "1") await comandar("V9", 1, "rotina");
    historico.evento("rotina", "rotina", a.descricao);
  }

  async function aplicarAusente(agora, forcar = false) {
    const alvo = alvoAusente(padrao, agora);
    for (const [k, nivel] of Object.entries(alvo)) {
      // só mexe quando o alvo muda: um ajuste manual no meio não é desfeito a cada minuto
      if (!forcar && alvoAplicado[k] === nivel) continue;
      alvoAplicado[k] = nivel;
      if (Number(estado().rooms[k]) !== nivel) await setRoom(k, nivel, "rotina");
    }
  }

  let ocupado = false;
  async function tick() {
    if (ocupado) return;
    ocupado = true;
    const agora = Date.now();
    try {
      if (!aprendidoEm || agora - aprendidoEm > 30 * MIN) await reaprender(agora);
      for (const a of devidas(cfg.automacoes, agora, disparadas)) {
        disparadas.add(a.chave);
        await executar(a, agora).catch((e) => console.warn(`[rotina] ${a.id}: ${e.message}`));
      }
      if (cfg.ausente.ligado) await aplicarAusente(agora);
      atualizarSugestoes(agora);
    } catch (e) {
      console.warn(`[rotina] ${e.message}`);
    } finally {
      ocupado = false;
    }
  }

  async function iniciar() {
    const salvo = await historico.lerConfig("rotina");
    if (salvo) cfg = { ...cfg, ...salvo };
    await tick();
    setInterval(tick, 30000).unref();
  }

  async function setAusente(ligado, origem = "painel") {
    if (cfg.ausente.ligado === !!ligado) return;
    cfg.ausente = { ligado: !!ligado, desde: ligado ? Date.now() : null };
    historico.evento("ausente", origem, ligado ? "ligado" : "desligado");
    for (const k in alvoAplicado) delete alvoAplicado[k];
    await salvar();
    if (ligado) await aplicarAusente(Date.now(), true);
    atualizarSugestoes();
  }

  /** Aceitar uma sugestão: automação nova, ação imediata ou modo ausente. */
  async function aceitar(id, origem = "painel") {
    const s = sugestoes.find((x) => x.id === id);
    if (!s) throw Object.assign(new Error("Sugestão não existe mais."), { status: 404 });
    if (s.tipo === "automacao") {
      cfg.automacoes = [...cfg.automacoes.filter((a) => a.id !== s.automacao.id), { ...s.automacao, criadaEm: Date.now() }];
      historico.evento("rotina", origem, `automação criada: ${s.automacao.descricao}`);
      await salvar();
    } else if (s.tipo === "acao") {
      await comandar(s.acao.pino, s.acao.valor, origem);
    } else if (s.tipo === "ausente") {
      await setAusente(true, origem);
    }
    atualizarSugestoes();
  }

  /** Dispensar: some por 7 dias (as de agora, por 3 h). */
  async function dispensar(id) {
    const s = sugestoes.find((x) => x.id === id);
    cfg.dispensadas = { ...cfg.dispensadas, [id]: Date.now() + (s?.tipo === "automacao" ? 7 * DIA_MS : 3 * H) };
    await salvar();
    atualizarSugestoes();
  }

  async function removerAutomacao(id, origem = "painel") {
    const a = cfg.automacoes.find((x) => x.id === id);
    if (!a) throw Object.assign(new Error("Automação não existe."), { status: 404 });
    cfg.automacoes = cfg.automacoes.filter((x) => x.id !== id);
    historico.evento("rotina", origem, `automação removida: ${a.descricao}`);
    await salvar();
    atualizarSugestoes();
  }

  /** Resumo para o painel (GET /api/rotina). */
  function resumo() {
    const fmt = (g) => ({ saida: hhmm(g.saida), chegada: hhmm(g.chegada), amostras: g.amostras });
    return {
      aprendidoEm, dias: rotina.dias,
      porDia: rotina.porDia.map((d) => ({ dia: d.dia, ...fmt(d) })),
      uteis: fmt(rotina.uteis), fds: fmt(rotina.fds),
      padrao, limiar: LIMIAR_LUZ,
      automacoes: cfg.automacoes, ausente: cfg.ausente, sugestoes,
    };
  }

  return {
    iniciar, aceitar, dispensar, removerAutomacao, setAusente, resumo, tick,
    // o que vai no state (stream): sugestões e modo ausente aparecem na hora na aba Casa
    estadoResumido: () => ({ sugestoes: sugestoes.map(({ id, tipo, titulo, texto }) => ({ id, tipo, titulo, texto })), ausente: cfg.ausente }),
  };
}

module.exports = { criarRotina, aprender, diasObservados, padraoLuzes, intervalosAusente, sugerir, devidas, alvoAusente, hhmm, AUSENTE_MS, COMODOS };
