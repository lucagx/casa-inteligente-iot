// Aba Consumo do painel (I3): kWh e R$ do dia/semana/mês, meta, comparação, dica, por cômodo e tarifa branca.
// Tudo calculado no servidor (/api/consumo, server/consumo.js) a partir do histórico.
const $ = (s) => document.querySelector(s);
const kwh = (x) =>
  `${(x || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh`;
const brl = (x) =>
  (x || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (x) =>
  `${Math.abs(x).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const diaCurto = (ts) =>
  new Date(ts)
    .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" })
    .replace(".", "");
const COMODOS = [
  ["sala", "Sala", "#ffc27a"],
  ["cozinha", "Cozinha", "#ff9a5c"],
  ["quarto", "Quarto", "#c9a7ff"],
  ["externa", "Externa", "#5ee7ff"],
  ["carregador", "Carro elétrico", "#36e39a"],
  ["base", "Placa e sensores", "#7d8ea3"],
];

export function criarConsumo() {
  let aberto = false;

  function render(c) {
    $("#cHoje").textContent = kwh(c.hoje.kWh);
    $("#cHojeR").textContent = brl(c.hoje.reais);
    $("#cMes").textContent = kwh(c.mes.kWh);
    $("#cMesR").textContent = `previsão ${brl(c.mes.projecaoReais)}`;
    // meta: barra da previsão do mês
    const p = Math.min(100, c.meta.pct);
    $("#cMetaBar").style.width = `${p}%`;
    $("#cMetaBar").classList.toggle("alto", c.meta.pct > 100);
    $("#cMetaTxt").textContent =
      `previsão ${kwh(c.mes.projecao)} de ${kwh(c.meta.kWh)} (${pct(c.meta.pct)} da meta)`;
    // comparação
    const cmp = c.comparacao;
    $("#cCmp").hidden = !cmp;
    if (cmp) {
      const menos = cmp.pct < 0;
      $("#cCmp").className = `card cmp ${menos ? "bom" : "ruim"}`;
      $("#cCmpN").textContent = `${menos ? "−" : "+"}${pct(cmp.pct)}`;
      $("#cCmpT").textContent = menos
        ? `Você economizou ${pct(cmp.pct)} — ${cmp.periodo}: ${kwh(cmp.atual)} contra ${kwh(cmp.anterior)} (${cmp.base}).`
        : `Gasto ${pct(cmp.pct)} maior — ${cmp.periodo}: ${kwh(cmp.atual)} contra ${kwh(cmp.anterior)} (${cmp.base}).`;
    }
    $("#cDica").textContent = c.dica;

    // últimos 7 dias, empilhado por cômodo
    const dias = c.dias.slice(-7);
    const max = Math.max(0.05, ...dias.map((d) => d.kWh));
    $("#cDias").innerHTML = dias
      .map(
        (d, i) => `
      <div class="bar-col" title="${diaCurto(d.ts)}: ${kwh(d.kWh)}">
        <span class="bv">${d.kWh.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span>
        <span class="bb stack">${COMODOS.map(([k, , cor]) => `<i style="height:${((100 * (d.porComodo[k] || 0)) / max).toFixed(2)}%;background:${cor}"></i>`).join("")}</span>
        <span class="bl">${i === dias.length - 1 ? "hoje" : diaCurto(d.ts)}</span>
      </div>`,
      )
      .join("");
    $("#cLegenda").innerHTML = COMODOS.map(
      ([, n, cor]) => `<span><i style="background:${cor}"></i>${n}</span>`,
    ).join("");

    // por cômodo no mês
    const tot = Object.values(c.porComodoMes).reduce((s, x) => s + x, 0) || 1;
    $("#cComodos").innerHTML = COMODOS.map(([k, n, cor]) => {
      const v = c.porComodoMes[k] || 0;
      return `<div class="crow"><span>${n}<small>${(c.potencias[k] || 0).toLocaleString("pt-BR")} W${k === "base" ? " fixos" : ""}</small></span>
        <span class="cbar"><i style="width:${((100 * v) / tot).toFixed(1)}%;background:${cor}"></i></span>
        <b>${kwh(v)}</b></div>`;
    }).join("");

    // tarifa branca
    const f = c.branca.faixas,
      ft = f.fora + f.intermediaria + f.ponta || 1;
    $("#cFaixas").innerHTML = [
      ["fora", "fora de ponta"],
      ["intermediaria", "intermediária"],
      ["ponta", "ponta"],
    ]
      .map(
        ([k, n]) =>
          `<i class="${k}" style="width:${((100 * f[k]) / ft).toFixed(1)}%" title="${n}: ${kwh(f[k])}"></i>`,
      )
      .join("");
    $("#cConv").textContent = brl(c.branca.convencional);
    $("#cBranca").textContent = brl(c.branca.branca);
    $("#cBrancaTxt").textContent =
      c.branca.branca < c.branca.convencional
        ? `A tarifa branca sairia ${brl(c.branca.convencional - c.branca.branca)} mais barata neste mês.`
        : `${pct(c.branca.pctPonta)} do consumo foi na ponta: a tarifa branca ainda não compensa.`;
    $("#cNota").textContent =
      `Tarifa ${brl(c.tarifa)}/kWh. Potências de uma casa real equivalente (o protoboard gasta miliwatts); ` +
      `dados desde ${new Date(c.desdeDados).toLocaleDateString("pt-BR")}.`;
  }

  async function carregar() {
    try {
      const r = await fetch("/api/consumo", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      render(j);
      $("#consErro").hidden = true;
    } catch (e) {
      $("#consErro").hidden = false;
      $("#consErro").textContent =
        `Consumo indisponível agora (${e.message}). A casa continua funcionando.`;
    }
  }
  setInterval(() => aberto && carregar(), 60000);

  return {
    abrir() {
      aberto = true;
      carregar();
    },
    fechar() {
      aberto = false;
    },
  };
}
