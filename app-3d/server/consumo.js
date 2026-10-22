/*
 * Consumo de energia e economia (I3) — calculado a partir do histórico (H3).
 * ------------------------------------------------------------------
 * As luzes do protoboard gastam miliwatts; para o IoB fazer sentido, cada cômodo usa a potência de uma casa real
 * equivalente (CONSUMO_W no .env). Energia = potência × nível do cômodo (0–100 %) × tempo ligado.
 *
 *   - Nível de cada cômodo: leituras V20 sala, V21 cozinha, V22 quarto, V23 externa (gravadas pelo server.js).
 *     Antes do primeiro registro de um cômodo (dados antigos, demonstração), vale a regra da luz geral:
 *     V0 ligado ⇒ todos os cômodos a 100 %.
 *   - "base": NodeMCU, sensores e roteador, sempre ligados.
 *   - "carregador" do carro elétrico (V3): potência cheia enquanto V24 = 1 (carregando).
 *   - Tarifa convencional TARIFA_KWH (R$/kWh) e simulação da tarifa branca: ponta 18h–21h e intermediária
 *     17h–18h / 21h–22h nos dias úteis; resto (e fim de semana) fora de ponta. Fatores aproximados em relação
 *     à convencional (TARIFA_BRANCA no .env).
 *   - Integração minuto a minuto (30 dias × 4 cômodos ≈ 170 mil passos: alguns ms).
 */

const COMODOS = { sala: "V20", cozinha: "V21", quarto: "V22", externa: "V23" };
const CARREGADOR = "V24"; // carregando (0/1), gravado pelo server.js (server/carregador.js)
const POTENCIA_PADRAO = { sala: 60, cozinha: 50, quarto: 30, externa: 80, base: 1.5, carregador: 2200 }; // watts
const FATOR_BRANCA_PADRAO = { fora: 0.75, intermediaria: 1.15, ponta: 1.8 };
const PASSO_MS = 60000;
const DIA_MS = 86400000;

// "sala=60,externa=100,base=2" → { ...padrão, sala: 60, externa: 100, base: 2 }
function lerPares(txt, padrao) {
  const out = { ...padrao };
  for (const par of String(txt || "").split(",")) {
    const [k, v] = par.split("=").map((x) => x.trim());
    if (k in padrao && Number.isFinite(Number(v)) && Number(v) >= 0) out[k] = Number(v);
  }
  return out;
}

// faixa da tarifa branca na hora local
function faixa(ts) {
  const d = new Date(ts), dia = d.getDay(), h = d.getHours();
  if (dia === 0 || dia === 6) return "fora";
  if (h >= 18 && h < 21) return "ponta";
  if (h === 17 || h === 21) return "intermediaria";
  return "fora";
}

const inicioDoDia = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const chaveDia = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// linha do tempo em degraus [[ts, valor]] → função valor(t) para t crescente (ponteiro, sem busca)
function degraus(pts, inicial) {
  let i = 0, atual = inicial;
  return (t) => { while (i < pts.length && pts[i][0] <= t) atual = pts[i++][1]; return atual; };
}

/**
 * leituras: resposta de historico.leituras({ desde, ate, pinos: ["V0", "V20".."V23", "V24"] })
 * → consumo por dia, por cômodo e por faixa da tarifa branca, mais resumo, meta, comparação e dica.
 */
function calcular(leituras, { potencias = POTENCIA_PADRAO, tarifa = 0.85, fatores = FATOR_BRANCA_PADRAO, metaMensal = 25, agora = Date.now() } = {}) {
  const { desde, ate, pinos = {}, antes = {} } = leituras;
  const num = (v) => (v === undefined || v === null || v === "" ? NaN : Number(v));
  const v0 = degraus(pinos.V0 || [], num(antes.V0?.[1]) === 1 ? 1 : 0);
  // cômodo: antes do primeiro registro dele, segue o V0; depois, o próprio nível (0–100 → 0–1)
  const nivel = {};
  for (const [k, pino] of Object.entries(COMODOS)) {
    const pts = (pinos[pino] || []).map(([t, v]) => [t, Math.min(1, Math.max(0, num(v) / 100 || 0))]);
    const inicio = antes[pino] ? -Infinity : pts.length ? pts[0][0] : Infinity;
    const proprio = degraus(pts, antes[pino] ? Math.min(1, Math.max(0, num(antes[pino][1]) / 100 || 0)) : 0);
    nivel[k] = (t) => { const g = v0(t); const p = proprio(t); return t < inicio ? g : p; };
  }
  const carregando = degraus((pinos[CARREGADOR] || []).map(([t, v]) => [t, num(v) === 1 ? 1 : 0]), num(antes[CARREGADOR]?.[1]) === 1 ? 1 : 0);
  // dados de verdade a partir de quando? (para saber se dá para comparar com a semana anterior)
  const primeiros = Object.values(pinos).map((p) => p[0]?.[0]).filter(Number.isFinite);
  const conhecidos = [...Object.values(antes).map((a) => a[0]), ...primeiros].filter(Number.isFinite);
  const temDadosDesde = conhecidos.length ? Math.min(...conhecidos) : desde; // sem dado nenhum: o período inteiro
  // antes do histórico existir não há o que somar (senão o mês contaria só o consumo base de dias sem dados)
  const inicio = Math.max(desde, Math.floor(temDadosDesde / PASSO_MS) * PASSO_MS);

  const dias = new Map();
  const dia = (t) => {
    const k = chaveDia(t);
    if (!dias.has(k)) dias.set(k, { dia: k, ts: inicioDoDia(t), kWh: 0, porComodo: { sala: 0, cozinha: 0, quarto: 0, externa: 0, carregador: 0, base: 0 }, faixas: { fora: 0, intermediaria: 0, ponta: 0 }, carro: { fora: 0, intermediaria: 0, ponta: 0 } });
    return dias.get(k);
  };
  const h = PASSO_MS / 3600000; // horas por passo
  for (let t = inicio; t < ate; t += PASSO_MS) {
    const d = dia(t), f = faixa(t);
    let wh = potencias.base * h;
    d.porComodo.base += wh;
    for (const k of Object.keys(COMODOS)) {
      const e = potencias[k] * nivel[k](t) * h;
      d.porComodo[k] += e; wh += e;
    }
    const ec = (potencias.carregador || 0) * carregando(t) * h;
    d.porComodo.carregador += ec; d.carro[f] += ec / 1000; wh += ec;
    d.kWh += wh / 1000; d.faixas[f] += wh / 1000;
  }
  const lista = [...dias.values()].map((d) => ({ ...d, porComodo: Object.fromEntries(Object.entries(d.porComodo).map(([k, wh]) => [k, wh / 1000])) }));
  const soma = (de, a) => lista.filter((d) => d.ts >= de && d.ts < a).reduce((s, d) => s + d.kWh, 0);
  const reais = (kWh) => kWh * tarifa;

  const hoje0 = inicioDoDia(agora);
  const mes0 = new Date(agora); mes0.setDate(1); mes0.setHours(0, 0, 0, 0);
  const diasNoMes = new Date(mes0.getFullYear(), mes0.getMonth() + 1, 0).getDate();
  // projeção do mês sobre os dias que têm dados
  const decorrido = Math.max(1 / 24, (agora - Math.max(mes0.getTime(), inicio)) / DIA_MS);
  const kHoje = soma(hoje0, hoje0 + DIA_MS);
  const kSemana = soma(hoje0 - 6 * DIA_MS, hoje0 + DIA_MS);
  const kMes = soma(mes0.getTime(), hoje0 + DIA_MS);
  const projecao = (kMes / decorrido) * diasNoMes;

  // comparação: semana × semana anterior, se o histórico cobre as duas; senão hoje × média dos dias anteriores
  let comparacao = null;
  if (temDadosDesde <= hoje0 - 13 * DIA_MS) {
    const ant = soma(hoje0 - 13 * DIA_MS, hoje0 - 6 * DIA_MS);
    if (ant > 0) comparacao = { base: "semana anterior", atual: kSemana, anterior: ant, pct: ((kSemana - ant) / ant) * 100 };
  }
  if (!comparacao) {
    // sem duas semanas de histórico: ontem (dia inteiro) × média dos dias completos antes dele
    const ontem = lista.find((d) => d.ts === hoje0 - DIA_MS);
    const anteriores = lista.filter((d) => d.ts < hoje0 - DIA_MS && d.ts >= inicio);
    if (ontem && anteriores.length) {
      const media = anteriores.reduce((s, d) => s + d.kWh, 0) / anteriores.length;
      if (media > 0) comparacao = { base: `média dos ${anteriores.length} dias anteriores`, periodo: "ontem", atual: ontem.kWh, anterior: media, pct: ((ontem.kWh - media) / media) * 100 };
    }
  } else comparacao.periodo = "últimos 7 dias";

  // tarifa branca no período (o que já foi gasto no mês)
  const doMes = lista.filter((d) => d.ts >= mes0.getTime());
  const fx = doMes.reduce((s, d) => ({ fora: s.fora + d.faixas.fora, intermediaria: s.intermediaria + d.faixas.intermediaria, ponta: s.ponta + d.faixas.ponta }), { fora: 0, intermediaria: 0, ponta: 0 });
  const branca = (fx.fora * fatores.fora + fx.intermediaria * fatores.intermediaria + fx.ponta * fatores.ponta) * tarifa;
  const pctPonta = kMes > 0 ? (fx.ponta / kMes) * 100 : 0;

  // dica: o IoB influenciando o comportamento (números no formato brasileiro: 3,83)
  const br = (x, casas = 2) => x.toFixed(casas).replace(".", ",");
  const porComodoMes = doMes.reduce((s, d) => { for (const [k, v] of Object.entries(d.porComodo)) s[k] = (s[k] || 0) + v; return s; }, {});
  const [maiorK, maiorV] = Object.entries(porComodoMes).filter(([k]) => k !== "base").sort((a, b) => b[1] - a[1])[0] || ["", 0];
  const NOME = { sala: "a sala", cozinha: "a cozinha", quarto: "o quarto", externa: "a luz externa", carregador: "o carregador do carro" };
  const Nome = (k) => NOME[k][0].toUpperCase() + NOME[k].slice(1);
  // V3: carro carregado entre 17h e 22h nos dias úteis (ponta + intermediária)
  const carro = doMes.reduce((s, d) => ({ intermediaria: s.intermediaria + d.carro.intermediaria, ponta: s.ponta + d.carro.ponta }), { intermediaria: 0, ponta: 0 });
  const carroCaro = carro.ponta + carro.intermediaria;
  let dica;
  if (carroCaro >= 0.5) {
    const agora$ = (carro.ponta * fatores.ponta + carro.intermediaria * fatores.intermediaria) * tarifa;
    dica = `${br(carroCaro, 1)} kWh do carro foram carregados entre 17h e 22h em dia útil. Na tarifa branca essa carga custa ` +
      `R$ ${br(agora$, 2)}; com "Só fora de ponta" ligado no carregador, cairia para R$ ${br(carroCaro * fatores.fora * tarifa, 2)}.`;
  } else if (projecao > metaMensal) {
    const corte = maiorK === "carregador"
      ? `cada hora a menos de carga por dia economiza ~${br(((potencias.carregador * 30) / 1000), 0)} kWh/mês.`
      : `apagar 1 h mais cedo por dia economiza ~${br(((potencias[maiorK] * 30) / 1000), 1)} kWh/mês.`;
    dica = `No ritmo atual o mês fecha em ${br(projecao, 1)} kWh, ${br((((projecao - metaMensal) / metaMensal) * 100), 0)}% acima da meta. ` +
      (maiorV > 0 ? `${Nome(maiorK)} é quem mais gasta (${br(((maiorV / kMes) * 100), 0)}% do mês): ${corte}` : "");
  } else if (pctPonta >= 20) {
    const tudoFora = (fx.fora + fx.intermediaria + fx.ponta) * fatores.fora * tarifa;
    dica = `${br(pctPonta, 0)}% do consumo do mês foi no horário de ponta (18h–21h, dias úteis). Na tarifa branca a conta seria ` +
      `R$ ${br(branca, 2)} (convencional: R$ ${br(reais(kMes), 2)}); levando esse uso para depois das 22h, cairia para R$ ${br(tudoFora, 2)}.`;
  } else {
    dica = `Dentro da meta: ${br(projecao, 1)} de ${metaMensal} kWh previstos no mês.` + (maiorV > 0 ? ` ${Nome(maiorK)} responde por ${br(((maiorV / kMes) * 100), 0)}% do consumo.` : "");
  }

  return {
    potencias, tarifa, fatores,
    desdeDados: inicio,
    dias: lista,
    hoje: { kWh: kHoje, reais: reais(kHoje) },
    semana: { kWh: kSemana, reais: reais(kSemana) },
    mes: { kWh: kMes, reais: reais(kMes), projecao, projecaoReais: reais(projecao) },
    meta: { kWh: metaMensal, pct: (projecao / metaMensal) * 100 },
    branca: { convencional: reais(kMes), branca, pctPonta, faixas: fx },
    porComodoMes,
    comparacao,
    dica,
  };
}

module.exports = { calcular, faixa, lerPares, COMODOS, CARREGADOR, POTENCIA_PADRAO, FATOR_BRANCA_PADRAO };
