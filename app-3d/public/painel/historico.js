// Aba Histórico do painel (I2): temperatura/umidade, mapa de presença hora × dia, tempo de luz ligada por dia
// e linha do tempo de eventos (quem fez). Dados de /api/history e /api/events (H3); ao vivo pelo evento "evento" do SSE.
import uPlot from '/vendor/uplot/uPlot.esm.js';

const $ = (s) => document.querySelector(s);
const DIA = 86400000;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

async function api(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// textos da linha do tempo
const ORIGEM = { painel: 'painel', cena: 'cena', automatico: 'automático', dispositivo: 'app/botão', sensor: 'sensor', sistema: 'sistema', casa3d: 'casa 3D', blynk: 'Blynk', rotina: 'rotina', conforto: 'conforto' };
const TEXTO = {
  luz: (d) => `Luz geral ${d}`,
  porta: (d) => `Porta ${d}`,
  janela: (d) => `Janela ${d}`,
  modo: (d) => `Modo ${d === 'automatico' ? 'automático' : d}`,
  alarme: (d) => `Alarme ${d}`,
  presenca: () => 'Presença detectada',
  placa: (d) => `NodeMCU ${d}`,
  cena: (d) => `Cena ${d}`,
  carro: (d) => `Carro ${d === 'chegou' ? 'chegou à garagem' : 'saiu da garagem'}`,
  rotina: (d) => `Rotina: ${d}`,
  ausente: (d) => `Modo ausente ${d}`,
  conforto: (d) => `Conforto: ${d}`,
  alerta: (d) => `Alerta: ${d}`,
  privacidade: (d) => `Privacidade: ${d}`,
  carregador: (d) => (d === 'carregando' ? 'Carro carregando' : d === 'parado' ? 'Carga do carro parou' : `Carregador ${d}`),
};
const COR = { luz: 'amber', presenca: 'cyan', alarme: 'red', cena: 'cyan', placa: 'muted', carregador: 'green', carro: 'muted', rotina: 'amber', ausente: 'cyan', conforto: 'cyan', alerta: 'red', privacidade: 'muted' };
const hora = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaCurto = (ts) => new Date(ts).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace('.', '');
const inicioDoDia = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const duracao = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

export function criarHistorico({ toast }) {
  let periodo = '24h', filtro = '', limite = 20, aberto = false, carregado = false;
  let grafico = null, recarregarT = null;

  // ---------- temperatura e umidade ----------
  async function carregarTemp() {
    const j = await api(`/api/history?desde=${periodo}&pinos=V4,V5`);
    const t4 = j.pinos.V4 || [], t5 = j.pinos.V5 || [];
    // eixo x único (segundos): umidade alinhada ao tempo da temperatura (as duas são amostradas juntas)
    const xs = t4.map(([ts]) => ts / 1000);
    const umidEm = (ts) => { let v = null; for (const [t, u] of t5) { if (t > ts) break; v = u; } return v; };
    const dados = [xs, t4.map(([, v]) => Number(v)), t4.map(([ts]) => { const u = umidEm(ts); return u === null ? null : Number(u); })];
    const el = $('#chTemp');
    const largura = el.clientWidth || 340;
    const eixo = { stroke: css('--muted'), grid: { stroke: 'rgba(255,255,255,0.06)' }, ticks: { stroke: 'rgba(255,255,255,0.08)' }, font: '11px "JetBrains Mono", monospace' };
    const opts = {
      width: largura, height: 200, legend: { show: true, live: true },
      cursor: { drag: { x: false, y: false } },
      scales: { x: { time: true }, t: { auto: true }, u: { range: [0, 100] } },
      axes: [
        { ...eixo, values: periodo === '24h' ? (u, v) => v.map((s) => hora(s * 1000)) : (u, v) => v.map((s) => diaCurto(s * 1000)) },
        { ...eixo, scale: 't', values: (u, v) => v.map((x) => `${x}°`), size: 40 },
        { ...eixo, scale: 'u', side: 1, values: (u, v) => v.map((x) => `${x}%`), size: 42, grid: { show: false } },
      ],
      series: [
        { label: 'Quando', value: (u, s) => (s == null ? '--' : new Date(s * 1000).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })) },
        { label: 'Temperatura', scale: 't', stroke: css('--amber'), width: 2, value: (u, v) => (v == null ? '--' : `${v.toFixed(1)} °C`), fill: 'rgba(255,194,122,0.08)' },
        { label: 'Umidade', scale: 'u', stroke: css('--cyan'), width: 1.5, value: (u, v) => (v == null ? '--' : `${Math.round(v)} %`) },
      ],
    };
    grafico?.destroy();
    el.innerHTML = '';
    grafico = xs.length ? new uPlot(opts, dados, el) : null;
    if (!grafico) el.innerHTML = '<p class="hint">Sem leituras neste período.</p>';
  }

  // ---------- mapa de calor de presença (últimos 7 dias × 24 horas) ----------
  async function carregarPresenca() {
    const j = await api('/api/events?desde=7d&tipo=presenca&limite=1000');
    const hoje = inicioDoDia(Date.now());
    const dias = Array.from({ length: 7 }, (_, i) => hoje - (6 - i) * DIA);
    const m = dias.map(() => new Array(24).fill(0));
    for (const e of j.eventos) {
      const i = dias.findIndex((d) => e.ts >= d && e.ts < d + DIA);
      if (i >= 0) m[i][new Date(e.ts).getHours()]++;
    }
    const max = Math.max(1, ...m.flat());
    $('#hmTotal').textContent = `${j.eventos.length} detecções`;
    $('#heat').innerHTML =
      `<span></span>${Array.from({ length: 24 }, (_, h) => `<span class="hh">${h % 6 === 0 ? h : ''}</span>`).join('')}` +
      dias.map((d, i) => `<span class="hd">${diaCurto(d)}</span>` + m[i].map((n, h) =>
        `<i style="--a:${n ? (0.18 + 0.82 * n / max).toFixed(2) : 0}" title="${diaCurto(d)} ${String(h).padStart(2, '0')}h · ${n} ${n === 1 ? 'detecção' : 'detecções'}"></i>`).join('')).join('');
  }

  // ---------- tempo de luz geral (V0) ligada por dia ----------
  async function carregarLuz() {
    const j = await api('/api/history?desde=7d&pinos=V0');
    const agora = Date.now(), hoje = inicioDoDia(agora);
    const dias = Array.from({ length: 7 }, (_, i) => hoje - (6 - i) * DIA);
    const tot = dias.map(() => 0);
    // segmentos ligados: do estado inicial ("antes") e de cada mudança, até a próxima (ou até agora)
    const pts = [...(j.antes?.V0 ? [[j.desde, j.antes.V0[1]]] : []), ...(j.pinos.V0 || [])];
    for (let k = 0; k < pts.length; k++) {
      if (Number(pts[k][1]) !== 1) continue;
      const a = pts[k][0], b = k + 1 < pts.length ? pts[k + 1][0] : agora;
      dias.forEach((d, i) => { tot[i] += Math.max(0, Math.min(b, d + DIA) - Math.max(a, d)); });
    }
    const max = Math.max(3600000, ...tot);
    $('#luzDia').innerHTML = dias.map((d, i) => `
      <div class="bar-col" title="${diaCurto(d)}: ${duracao(tot[i])}">
        <span class="bv">${tot[i] ? duracao(tot[i]) : '—'}</span>
        <span class="bb"><i style="height:${(100 * tot[i] / max).toFixed(1)}%"></i></span>
        <span class="bl">${i === 6 ? 'hoje' : diaCurto(d)}</span>
      </div>`).join('');
  }

  // ---------- linha do tempo ----------
  const linha = (e) => `
    <li class="ev ${COR[e.tipo] || ''}">
      <time>${hora(e.ts)}<small>${new Date(e.ts).toDateString() === new Date().toDateString() ? '' : diaCurto(e.ts)}</small></time>
      <span class="et">${(TEXTO[e.tipo] || ((d) => `${e.tipo} ${d}`))(e.detalhe)}</span>
      <span class="eo">${ORIGEM[e.origem] || e.origem}</span>
    </li>`;
  async function carregarLinha() {
    const j = await api(`/api/events?desde=7d&limite=${limite}${filtro ? `&tipo=${filtro}` : ''}`);
    $('#timeline').innerHTML = j.eventos.map(linha).join('') || '<li class="hint">Nenhum evento nos últimos 7 dias.</li>';
    $('#tlMais').hidden = j.eventos.length < limite || limite >= 1000;
  }

  async function carregar(partes = ['temp', 'presenca', 'luz', 'linha']) {
    const f = { temp: carregarTemp, presenca: carregarPresenca, luz: carregarLuz, linha: carregarLinha };
    const r = await Promise.allSettled(partes.map((p) => f[p]()));
    const erro = r.find((x) => x.status === 'rejected');
    $('#histErro').hidden = !erro;
    if (erro) $('#histErro').textContent = `Histórico indisponível agora (${erro.reason.message}). A casa continua funcionando.`;
    carregado = true;
  }

  // ---------- controles ----------
  document.querySelectorAll('[data-periodo]').forEach((b) => b.addEventListener('click', () => {
    periodo = b.dataset.periodo;
    document.querySelectorAll('[data-periodo]').forEach((x) => x.classList.toggle('on', x === b));
    carregar(['temp']);
  }));
  $('#tlFiltro').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tipo]');
    if (!b) return;
    filtro = b.dataset.tipo; limite = 20;
    $('#tlFiltro').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    carregar(['linha']);
  });
  $('#tlMais').addEventListener('click', () => { limite = Math.min(1000, limite + 40); carregar(['linha']); });
  addEventListener('resize', () => { if (aberto && grafico) grafico.setSize({ width: $('#chTemp').clientWidth, height: 200 }); });
  // leituras de temperatura chegam a cada 5 min: com a aba aberta, atualiza nesse ritmo
  setInterval(() => aberto && carregar(['temp', 'luz']), 5 * 60000);

  return {
    abrir() { aberto = true; if (!carregado) carregar(); else if (grafico) grafico.setSize({ width: $('#chTemp').clientWidth, height: 200 }); },
    fechar() { aberto = false; },
    // ao vivo: evento novo do stream entra no topo da linha do tempo; mapa e luz se atualizam logo depois
    evento(e) {
      if (!carregado) return;
      if (!filtro || filtro.split(',').includes(e.tipo)) {
        $('#timeline').insertAdjacentHTML('afterbegin', linha(e));
        $('#timeline').firstElementChild.classList.add('novo');
      }
      if (e.tipo === 'presenca' || e.tipo === 'luz') {
        clearTimeout(recarregarT);
        recarregarT = setTimeout(() => aberto && carregar(['presenca', 'luz']), 3000);
      }
    },
    toast,
  };
}
