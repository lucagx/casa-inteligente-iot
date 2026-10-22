/*
 * Carregador do carro elétrico (V3) — dispositivo virtual da casa, como as luzes por cômodo.
 * ------------------------------------------------------------------
 * Não existe no protoboard: vive no servidor e entra no histórico (H3) e no consumo (I3).
 *
 *   - Só carrega com o carro na garagem (o cabo fica na parede da garagem).
 *   - "Só fora de ponta": com o carregador ligado, espera a faixa fora de ponta da tarifa branca
 *     (22h–17h nos dias úteis, o fim de semana inteiro) — a mesma faixa usada no consumo.
 *   - A bateria sobe com a energia que de fato entra: kW × horas ÷ capacidade da bateria.
 *     Ao chegar em 100 % para sozinho (o carregador continua ligado, pronto para a próxima vez).
 *   - Saiu e voltou: a bateria volta mais baixa (gasto do trajeto, proporcional ao tempo fora).
 *
 * Histórico (pinos que só existem no histórico, como V20–V23):
 *   V24 carregando (0/1) · V25 bateria (%) · V26 carro na garagem (0/1)
 * .env: CARREGADOR_KW (padrão 2,2 — carregador portátil na tomada 220 V), BATERIA_KWH (padrão 40).
 */
const { faixa } = require("./consumo");

const PINOS = { carregando: "V24", bateria: "V25", naGaragem: "V26" };
const KW_PADRAO = 2.2;
const BATERIA_KWH_PADRAO = 40;
const H = 3600000;

// gasto do trajeto: 3 % + 1 % por hora fora (um dia de trabalho ≈ 14 %, uns 35 km), no máximo 25 %
const gastoDaViagem = (msFora) => Math.min(25, 3 + msFora / H);

function criarCarregador({ kW = KW_PADRAO, bateriaKWh = BATERIA_KWH_PADRAO, agora = Date.now() } = {}) {
  const s = {
    naGaragem: true,
    ligado: false,
    foraDePonta: false,
    carregando: false,
    aguardando: false, // ligado, carro na garagem, mas esperando o horário fora de ponta
    bateria: 62,
    kW,
    bateriaKWh,
  };
  let ultimo = agora, saiuEm = null;

  // quem decide se está carregando agora
  function decidir(t) {
    const pode = s.naGaragem && s.ligado && s.bateria < 100;
    const espera = pode && s.foraDePonta && faixa(t) !== "fora";
    s.carregando = pode && !espera;
    s.aguardando = espera;
  }

  /** Avança o tempo até `t`: soma a energia que entrou e reavalia (ex.: virou 22h). */
  function tick(t = Date.now()) {
    const dt = Math.max(0, t - ultimo);
    ultimo = t;
    if (s.carregando) s.bateria = Math.min(100, s.bateria + ((s.kW * dt) / H / s.bateriaKWh) * 100);
    decidir(t);
    return foto(t);
  }

  function comando({ ligado, foraDePonta } = {}, t = Date.now()) {
    tick(t);
    if (ligado !== undefined) s.ligado = !!ligado;
    if (foraDePonta !== undefined) s.foraDePonta = !!foraDePonta;
    decidir(t);
    return foto(t);
  }

  function entrar(t = Date.now()) {
    tick(t);
    if (!s.naGaragem) {
      if (saiuEm !== null) s.bateria = Math.max(5, s.bateria - gastoDaViagem(t - saiuEm));
      s.naGaragem = true;
      saiuEm = null;
    }
    decidir(t);
    return foto(t);
  }

  function sair(t = Date.now()) {
    tick(t);
    if (s.naGaragem) { s.naGaragem = false; saiuEm = t; }
    decidir(t);
    return foto(t);
  }

  /** Estado salvo no histórico (ao reiniciar o servidor): { V24, V25, V26 } com valores já lidos. */
  function restaurar(v, t = Date.now()) {
    if (v[PINOS.bateria] !== undefined && Number.isFinite(Number(v[PINOS.bateria]))) s.bateria = Math.min(100, Math.max(0, Number(v[PINOS.bateria])));
    if (v[PINOS.naGaragem] !== undefined) s.naGaragem = String(v[PINOS.naGaragem]) === "1";
    if (v[PINOS.carregando] !== undefined) s.ligado = String(v[PINOS.carregando]) === "1";
    if (!s.naGaragem) saiuEm = t;
    ultimo = t;
    decidir(t);
    return foto(t);
  }

  // o que vai para a tela (state.carro) — bateria com 1 casa; previsão de carga completa
  function foto(t = Date.now()) {
    const falta = ((100 - s.bateria) / 100) * s.bateriaKWh; // kWh
    return {
      naGaragem: s.naGaragem, ligado: s.ligado, foraDePonta: s.foraDePonta,
      carregando: s.carregando, aguardando: s.aguardando,
      bateria: Math.round(s.bateria * 10) / 10, kW: s.kW, bateriaKWh: s.bateriaKWh,
      cheioEm: s.carregando ? Math.round(t + (falta / s.kW) * H) : null,
    };
  }

  /** Valores gravados no histórico (strings, como os pinos da placa). */
  const pinos = () => ({
    [PINOS.carregando]: s.carregando ? "1" : "0",
    [PINOS.bateria]: String(Math.floor(s.bateria)),
    [PINOS.naGaragem]: s.naGaragem ? "1" : "0",
  });

  return { tick, comando, entrar, sair, restaurar, foto, pinos };
}

module.exports = { criarCarregador, PINOS, KW_PADRAO, BATERIA_KWH_PADRAO, gastoDaViagem };
