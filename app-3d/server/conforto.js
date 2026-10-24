/*
 * Conforto adaptativo da janela (I6) — o comportamento muda a regra (essência do IoB).
 * ------------------------------------------------------------------
 * Cada vez que alguém abre ou fecha a janela na mão (painel, casa 3D, app/botão), a temperatura daquele
 * momento (V4) é uma pista do conforto dessa pessoa: abriu com 28 °C ⇒ 30 °C é tarde demais para ela.
 * Os limites aprendidos são médias móveis exponenciais dessas temperaturas, partindo dos do firmware (30/27 °C).
 *
 * Sem mexer no firmware (a regra do automático da placa continua 30/27 °C):
 *   - "Aplicar no modo manual": com a casa no manual (as cenas e o painel deixam assim), o servidor abre e fecha
 *     a janela pelos limites aprendidos (origem "conforto", fora do aprendizado);
 *   - CONFORTO_V17=1 publica o limite de abrir no V17 do Blynk, para quando o firmware passar a ler esse pino.
 */

const ABRIR_PADRAO = 30,
  FECHAR_PADRAO = 27; // os mesmos do firmware
const ALFA = 0.35; // peso de cada ajuste novo na média móvel
const HISTERESE = 1.5; // fechar fica pelo menos 1,5 °C abaixo de abrir (sem abre-fecha)
const ESPERA_MS = 10 * 60000; // depois de qualquer mudança da janela, 10 min sem agir
const MANUAIS = new Set(["painel", "casa3d", "dispositivo", "blynk"]);

const arred = (x) => Math.round(x * 10) / 10;

/**
 * eventos: eventos "janela" (qualquer ordem) · temps: leituras do V4 [[ts, valor]] em ordem
 * → { abrir, fechar, ajustes: [{ ts, acao, temp, origem }] }
 */
function aprender(eventos, temps) {
  const tempEm = (ts) => {
    // última leitura até 10 min antes do evento (o DHT11 é amostrado a cada 5 min)
    let v = null;
    for (const [t, x] of temps) {
      if (t > ts) break;
      if (ts - t <= 10 * 60000 && Number.isFinite(Number(x))) v = Number(x);
    }
    return v;
  };
  const ajustes = [...eventos]
    .sort((a, b) => a.ts - b.ts)
    .filter((e) => MANUAIS.has(e.origem))
    .map((e) => ({
      ts: e.ts,
      acao: e.detalhe === "aberta" ? "abriu" : "fechou",
      temp: tempEm(e.ts),
      origem: e.origem,
    }))
    .filter((a) => a.temp !== null);
  let abrir = ABRIR_PADRAO,
    fechar = FECHAR_PADRAO;
  for (const a of ajustes) {
    if (a.acao === "abriu") abrir = abrir + ALFA * (a.temp - abrir);
    else fechar = fechar + ALFA * (a.temp - fechar);
  }
  abrir = Math.min(34, Math.max(22, abrir));
  fechar = Math.min(abrir - HISTERESE, Math.max(18, fechar));
  return { abrir: arred(abrir), fechar: arred(fechar), ajustes };
}

/** O que fazer com a janela agora: "abrir" | "fechar" | null. */
function decidir({
  temp,
  janela,
  abrir,
  fechar,
  ultimaMudanca = 0,
  agora = Date.now(),
}) {
  if (!Number.isFinite(temp) || agora - ultimaMudanca < ESPERA_MS) return null;
  if (temp >= abrir && janela === "FECHADA") return "abrir";
  if (temp <= fechar && janela === "ABERTA") return "fechar";
  return null;
}

/**
 * Serviço: historico (server/history.js) · estado() · comandar(pino, valor, origem) · aoMudar() · blynk(pino, valor) opcional
 */
function criarConforto({ historico, estado, comandar, aoMudar, publicarV17 }) {
  let cfg = { aplicar: false };
  let aprendido = { abrir: ABRIR_PADRAO, fechar: FECHAR_PADRAO, ajustes: [] };
  let aprendidoEm = 0,
    ultimaJanela = null,
    ultimaMudanca = 0,
    publicado = null;

  async function reaprender(agora = Date.now()) {
    const desde = agora - 30 * 86400000;
    const [evs, lt] = await Promise.all([
      historico.eventos({ desde, ate: agora, tipos: ["janela"], limite: 2000 }),
      historico.leituras({ desde, ate: agora, pinos: ["V4"] }),
    ]);
    const antes = aprendido;
    aprendido = aprender(evs.eventos, lt.pinos.V4 || []);
    aprendidoEm = agora;
    if (antes.abrir !== aprendido.abrir || antes.fechar !== aprendido.fechar)
      aoMudar();
    if (publicarV17 && publicado !== aprendido.abrir) {
      try {
        await publicarV17(aprendido.abrir);
        publicado = aprendido.abrir;
      } catch {
        /* datastream ainda não existe */
      }
    }
  }

  let ocupado = false;
  async function tick() {
    if (ocupado) return;
    ocupado = true;
    const agora = Date.now();
    try {
      const s = estado();
      if (s.values.V7 !== ultimaJanela) {
        // janela mudou (qualquer origem): reaprende logo e respeita a espera
        if (ultimaJanela !== null) {
          ultimaMudanca = agora;
          aprendidoEm = 0;
        }
        ultimaJanela = s.values.V7;
      }
      if (!aprendidoEm || agora - aprendidoEm > 10 * 60000)
        await reaprender(agora);
      // só no manual e sem cena em andamento; no automático quem manda é o firmware (30/27 °C)
      if (cfg.aplicar && s.values.V3 === "0" && !s.scene) {
        const acao = decidir({
          temp: Number(s.values.V4),
          janela: s.values.V7,
          ...aprendido,
          ultimaMudanca,
          agora,
        });
        if (acao) {
          ultimaMudanca = agora;
          await comandar("V2", acao === "abrir" ? 1 : 0, "conforto");
        }
      }
    } catch (e) {
      console.warn(`[conforto] ${e.message}`);
    } finally {
      ocupado = false;
    }
  }

  async function iniciar() {
    const salvo = await historico.lerConfig("conforto");
    if (salvo) cfg = { ...cfg, ...salvo };
    await tick();
    setInterval(tick, 15000).unref();
  }

  async function setAplicar(ligado, origem = "painel") {
    if (cfg.aplicar === !!ligado) return;
    cfg.aplicar = !!ligado;
    historico.evento(
      "conforto",
      origem,
      ligado
        ? "aplicando o limite aprendido no manual"
        : "limite aprendido desligado",
    );
    await historico.salvarConfig("conforto", cfg);
    aoMudar();
    await tick();
  }

  const resumo = () => ({
    abrir: aprendido.abrir,
    fechar: aprendido.fechar,
    firmware: { abrir: ABRIR_PADRAO, fechar: FECHAR_PADRAO },
    aplicar: cfg.aplicar,
    aprendidoEm,
    ajustes: aprendido.ajustes.slice(-8).reverse(),
    total: aprendido.ajustes.length,
  });

  return {
    iniciar,
    setAplicar,
    resumo,
    tick,
    estadoResumido: () => ({
      abrir: aprendido.abrir,
      fechar: aprendido.fechar,
      aplicar: cfg.aplicar,
      ajustes: aprendido.ajustes.length,
    }),
  };
}

module.exports = {
  aprender,
  decidir,
  criarConforto,
  ABRIR_PADRAO,
  FECHAR_PADRAO,
  HISTERESE,
};
