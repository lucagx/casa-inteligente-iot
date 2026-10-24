/*
 * Ponte do servidor com os datastreams novos do Blynk (K1)
 * ------------------------------------------------------------------
 * Coisas que só existem no servidor (cenas, carregador do carro, luz externa) ganham um pino no Blynk,
 * para aparecerem no dashboard/app e para as automações do Console poderem acioná-las:
 *   V16 cena (0 nenhuma · 1 Cheguei · 2 Saí · 3 Dormir · 4 Apresentação)
 *   V18 carregador do carro ligado (0/1) · V23 luz externa (0–100 %) · V25 bateria do carro (%)
 * (V12 continua sendo a distância do HC-SR04, desativado, e V13 é o Terminal — ver docs/BLYNK.md.)
 *
 * Dois sentidos, sem eco:
 *   - publicar(state): manda ao Blynk só o que mudou desde o último envio (cada envio gasta 1 mensagem da cota).
 *   - entrada(valores lidos): uma mudança vinda do app do Blynk ou de uma automação vira ação no servidor.
 *     Só conta se o valor lido mudou desde a leitura anterior E é diferente do que o servidor publicou —
 *     assim uma leitura atrasada (de antes do nosso envio chegar) não desfaz o que acabamos de mandar.
 * Pino sem datastream (ainda não criado no Console): o envio falha, fica 10 min sem tentar de novo.
 *
 * Eventos (K3): os alertas da I7 viram eventos do Blynk (linha do tempo + push no celular) pela API HTTP
 * (/external/api/logEvent), sem mexer no firmware. "NodeMCU offline" fica com o evento embutido do Blynk.
 * O Blynk aceita 100 logEvent por dia por dispositivo: o servidor para em LIMITE_DIA e não repete o mesmo
 * evento em menos de REPETIR_MS. O resumo do dia (insights) vai às 21h como "resumo_diario".
 */

const PINOS = { cena: "V16", carregador: "V18", externa: "V23", bateria: "V25" };
// V16 no Blynk: índice do menu → id da cena em server/cenas.js
const CENAS = [null, "cheguei", "sai", "dormir", "apresentacao"];
// pinos que o app do Blynk e as automações podem mudar (o servidor lê junto com os sensores)
const ENTRADAS = [PINOS.cena, PINOS.carregador, PINOS.externa];
const ESPERA_FALHA_MS = 10 * 60000;
// alerta da I7 (server/insights.js) → código do evento no Console (Events & Notifications)
const EVENTOS = { invasao: "invasao", porta: "porta_aberta", calor: "calor_janela", bateria: "bateria_baixa" };
const RESUMO = "resumo_diario";
const LIMITE_DIA = 90, REPETIR_MS = 15 * 60000, MAX_TEXTO = 250;

/** Valores que o Blynk deve mostrar para um state do servidor (strings, como o Blynk devolve). */
function saida(state) {
  const out = {};
  const i = CENAS.indexOf(state.scene?.id ?? null);
  out[PINOS.cena] = String(i > 0 ? i : 0);
  if (state.carro) {
    out[PINOS.carregador] = state.carro.ligado ? "1" : "0";
    out[PINOS.bateria] = String(Math.floor(state.carro.bateria));
  }
  if (state.rooms) out[PINOS.externa] = String(state.rooms.externa);
  return out;
}

/** Valor lido do Blynk → ação, ou null se não for um valor válido para o pino. */
function acao(pino, valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  if (pino === PINOS.cena) return CENAS[n] ? { tipo: "cena", id: CENAS[n] } : null;
  if (pino === PINOS.carregador) return { tipo: "carregador", ligado: n >= 1 };
  if (pino === PINOS.externa) return { tipo: "externa", nivel: Math.round(Math.min(100, Math.max(0, n))) };
  return null; // V25 é só leitura no Blynk
}

/**
 * enviar(pino, valor) → Promise (blynkUpdate) · executar(ação) → Promise · avisar(texto) opcional (log)
 */
function criarPonte({ enviar, executar, avisar = () => {}, agora = () => Date.now() }) {
  const publicado = {}, lido = {}, falhou = {};
  const enviando = new Set();

  function publicar(state) {
    for (const [pino, v] of Object.entries(saida(state))) {
      if (publicado[pino] === v || enviando.has(pino)) continue;
      if (pino in falhou && agora() - falhou[pino] < ESPERA_FALHA_MS) continue;
      enviando.add(pino);
      Promise.resolve()
        .then(() => enviar(pino, v))
        .then(() => { publicado[pino] = v; delete falhou[pino]; })
        .catch((err) => {
          if (!(pino in falhou)) avisar(`${pino}: ${err.message} (o datastream existe no Console?)`);
          falhou[pino] = agora();
        })
        .finally(() => enviando.delete(pino));
    }
  }

  /** valores: { V16: "2", ... } lidos do Blynk. Devolve as ações disparadas (para teste/log). */
  function entrada(valores) {
    const feitas = [];
    for (const pino of ENTRADAS) {
      if (!(pino in valores)) continue;
      const v = String(valores[pino]);
      const anterior = lido[pino];
      lido[pino] = v;
      // 1ª leitura só registra; e um valor igual ao publicado é o nosso próprio envio voltando
      if (anterior === undefined || anterior === v || publicado[pino] === v) continue;
      const a = acao(pino, v);
      if (!a) continue;
      publicado[pino] = v; // o Blynk já mostra esse valor: não precisa reenviar
      feitas.push(a);
      Promise.resolve().then(() => executar(a)).catch((err) => avisar(`${pino}=${v}: ${err.message}`));
    }
    return feitas;
  }

  return { publicar, entrada, entradas: ENTRADAS };
}

/**
 * enviar(código, descrição) → Promise (logEvent no Blynk) · avisar(texto) opcional
 * alerta(a): a = alerta da I7 ({ id, titulo, texto }); resumo(texto): resumo do dia.
 * Devolvem true se o evento foi mandado (false = sem código, repetido ou acima do limite do dia).
 */
function criarEventos({ enviar, avisar = () => {}, agora = () => Date.now() }) {
  const ultimo = {};
  let dia = null, hoje = 0;

  function mandar(codigo, texto) {
    const t = agora(), d = new Date(t).toDateString();
    if (d !== dia) { dia = d; hoje = 0; }
    if (ultimo[codigo] !== undefined && t - ultimo[codigo] < REPETIR_MS) return false;
    if (hoje >= LIMITE_DIA) return false;
    ultimo[codigo] = t;
    hoje++;
    const desc = texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO - 1)}…` : texto;
    Promise.resolve().then(() => enviar(codigo, desc))
      .catch((err) => avisar(`evento ${codigo}: ${err.message} (o evento existe no Console, com notificação ligada?)`));
    return true;
  }

  return {
    alerta: (a) => (EVENTOS[a.id] ? mandar(EVENTOS[a.id], `${a.titulo}. ${a.texto}`) : false),
    resumo: (texto) => mandar(RESUMO, texto),
  };
}

module.exports = { criarPonte, criarEventos, saida, acao, PINOS, CENAS, ENTRADAS, EVENTOS, RESUMO };
