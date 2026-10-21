// Interface: conexão em tempo real (SSE), painel, hotspots, eventos e simulação.
import { fmt } from './format.js';
import { SENSORES } from './config.js';

const ICON = {
  temp: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  drop: '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  radar: '<path d="M4.9 19.1a10 10 0 1 1 14.2 0"/><path d="M8.5 15.5a5 5 0 1 1 7 0"/><circle cx="12" cy="12" r="1.5"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  door: '<path d="M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="13" cy="12" r="1"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  siren: '<path d="M6 18v-5a6 6 0 0 1 12 0v5"/><path d="M4 21h16M12 3v2M4.5 6.5l1.4 1.4M19.5 6.5l-1.4 1.4"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  car: '<path d="M5 16V12l2-5h10l2 5v4"/><path d="M3 16h18v2H3z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/><path d="M5 12h14"/>',
  min: '<path d="M6 12h12"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  lPanel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/>',
  lCompact: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  lFocus: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="2.5"/>',
  auto: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5"/>',
  // cenas (o servidor manda o nome do ícone em /api/scenes)
  chegar: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  lua: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
};
const svg = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

const DEVICES = [
  { key: 'luz', pin: 'V0', write: 'V0', icon: 'bulb', name: 'Luz geral', hw: 'LED · D1 · V0', on: (v) => v.V0 === '1', label: (on) => (on ? 'Ligada' : 'Desligada') },
  { key: 'porta', pin: 'V1', write: 'V1', icon: 'door', name: 'Porta', hw: 'LED trava · D0 · V1', on: (v) => v.V1 === '1', label: (on) => (on ? 'Destrancada' : 'Trancada') },
  { key: 'janela', pin: 'V7', write: 'V2', icon: 'window', name: 'Janela', hw: 'Servo SG90 · D7 · V2/V7', on: (v) => v.V7 === 'ABERTA', label: (on, v) => fmt.janela(v.V7) },
  { key: 'alarme', pin: 'V9', write: 'V9', icon: 'siren', name: 'Alarme', hw: 'Buzzer · D8 · V8/V9', on: (v) => v.V9 === '1', label: (on, v) => { const t = fmt.alarme(v.V8, v.V9); return t === 'Disparado' ? 'DISPARADO' : t; }, anyMode: true },
];

// Faixas do HC-SR04 da garagem (mesmas do modelo 3D)
export function garageZone(cm) {
  if (!Number.isFinite(cm)) return null;
  if (cm <= 10) return { text: 'pare!', kind: 'red' };
  if (cm <= 30) return { text: 'carro estacionado', kind: 'amber' };
  if (cm <= 80) return { text: 'carro entrando', kind: 'cyan' };
  return { text: 'vaga livre', kind: '' };
}

export function createUI({ quality, qualityAuto, views, onView, addHotspot, onState, onQuality, onSky }) {
  const $ = (s) => document.querySelector(s);
  const panel = $('#panel');
  let values = {}, meta = {}, lastStateAt = 0, first = true;
  const recentCmd = {};

  // ---------- chips de conexão ----------
  const chipLink = $('#chipLink'), chipDev = $('#chipDev'), chipAge = $('#chipAge');

  // ---------- sensores ----------
  $('#sensors').innerHTML = `
    <div class="sensor big" id="sTemp">${svg('temp')}<div><div class="k">Temperatura <span class="hw">DHT11 · D2 · V4</span></div><div class="v"><span id="vTemp">--</span><small>°C</small></div><div class="bar"><i id="bTemp"></i></div></div></div>
    <div class="sensor" id="sUmid">${svg('drop')}<div><div class="k">Umidade <span class="hw">DHT11 · V5</span></div><div class="v sm"><span id="vUmid">--</span><small>%</small></div></div></div>
    <div class="sensor" id="sLuz"><span id="icLuz">${svg('sun')}</span><div><div class="k">Luminosidade <span class="hw">LDR · A0 · V10</span></div><div class="v sm"><span id="vLuz">--</span><small>%</small></div><div class="bar"><i id="bLuz"></i></div></div></div>
    <div class="sensor" id="sPres">${svg('radar')}<div><div class="k">Presença <span class="hw">PIR · D5 · V11</span></div><div class="v sm" id="vPres">--</div><div class="psub" id="vPresAt"></div></div></div>
    <div class="sensor" id="sCar">${svg('car')}<div><div class="k">Garagem <span class="hw">HC-SR04 · D4/D6 · V12</span></div><div class="v sm"><span id="vCar">--</span><small id="uCar">cm</small></div><div class="bar"><i id="bCar"></i></div></div></div>`;

  // ---------- dispositivos ----------
  $('#devices').innerHTML = DEVICES.map((d) => `
    <button class="device" id="dev-${d.key}" type="button" aria-pressed="false">
      <span class="dicon">${svg(d.icon)}</span>
      <span class="dtext"><span class="dname">${d.name}</span><span class="dhw">${d.hw}</span></span>
      <span class="dstate" id="st-${d.key}">--</span>
      <span class="switch"><i></i></span>
    </button>`).join('');

  // luzes por cômodo (state.rooms, nível 0–100): qualquer uma acesa mantém o LED do D1 (luz geral) aceso
  const ROOMS = [['sala', 'Sala'], ['cozinha', 'Cozinha'], ['quarto', 'Quarto'], ['externa', 'Externa']];
  $('#rooms').innerHTML = `<span class="rlabel">Cômodos <em>acendem o D1</em></span>` + ROOMS.map(([k, n]) =>
    `<button type="button" class="room" id="room-${k}" data-room="${k}" aria-pressed="false">${svg('bulb')}<span>${n}</span><b id="rl-${k}">--</b></button>`).join('');
  $('#rooms').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-room]');
    if (!b) return;
    const k = b.dataset.room;
    recentCmd[k] = recentCmd.V0 = recentCmd.V3 = Date.now(); // o cômodo pode mexer na luz geral (D1) e no modo
    try {
      const r = await fetch('/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: k, level: Number(meta.rooms?.[k]) > 0 ? 0 : 100 }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'falha');
    } catch (err) { toast(`Não foi possível mudar a luz: ${err.message}`, 'err'); }
  });
  const roomText = (lvl) => (lvl === 0 ? 'off' : lvl >= 100 ? 'on' : `${lvl}%`);

  const modeAuto = $('#modeAuto'), modeManual = $('#modeManual');

  // ---------- hotspots na cena ----------
  const hot = {}, hv = {}; // hv: texto de leitura de cada hotspot (ainda fora do DOM até o 1º quadro)
  const HOT = [
    { key: 'luz', anchor: 'tv', title: 'Luz geral · D1', act: true, dev: 'luz' },
    { key: 'porta', anchor: 'porta', title: 'Porta · trava', act: true, dev: 'porta' },
    { key: 'janela', anchor: 'janela', title: 'Janela · servo', act: true, dev: 'janela' },
    { key: 'alarme', anchor: 'alarme', title: 'Sirene · buzzer', act: true, dev: 'alarme' },
    { key: 'dht', anchor: 'dht', title: 'DHT11 · D2' },
    { key: 'pir', anchor: 'pir', title: 'PIR · D5' },
    { key: 'garagem', anchor: 'garagem', title: 'HC-SR04 · garagem' },
    { key: 'ldr', anchor: 'ldr', title: 'LDR · A0' },
    { key: 'mcu', anchor: 'mcu', title: 'NodeMCU ESP8266' },
  ];
  for (const h of HOT) {
    if ((h.key === 'ldr' && !SENSORES.ldr) || (h.key === 'garagem' && !SENSORES.garagem)) continue;
    const el = document.createElement('div');
    el.className = 'hotspot' + (h.act ? ' act' : '');
    el.innerHTML = `<span class="dot"></span><span class="tag"><b>${h.title}</b><em id="hv-${h.key}">--</em></span>`;
    if (h.act) el.addEventListener('click', (e) => { e.stopPropagation(); toggle(DEVICES.find((d) => d.key === h.dev)); });
    hv[h.key] = el.querySelector('em');
    addHotspot(h.anchor, el);
    hot[h.key] = el;
  }

  // ---------- câmeras ----------
  $('#views').innerHTML = Object.entries(views).map(([k, v]) => `<button type="button" data-view="${k}">${v.label}</button>`).join('');
  $('#views').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    document.querySelectorAll('#views button').forEach((x) => x.classList.toggle('on', x === b));
    onView(b.dataset.view);
  });

  // ---------- qualidade ----------
  // ciclo: automática → alta → média → leve → automática (recarrega a página)
  const qBtn = $('#quality');
  const QNAME = { high: 'alta', medium: 'média', low: 'leve' };
  const QORDER = ['auto', 'high', 'medium', 'low'];
  let qCur = qualityAuto ? 'auto' : quality;
  let qLabel = '';
  function setQuality(tier, auto, msg) {
    qLabel = `Qualidade: ${QNAME[tier]}${auto ? ' (auto)' : ''}`;
    qBtn.textContent = qLabel;
    qBtn.title = 'Clique para trocar: automática → alta → média → leve';
    if (msg) toast(msg);
  }
  qBtn.addEventListener('click', () => onQuality(QORDER[(QORDER.indexOf(qCur) + 1) % QORDER.length]));

  // ---------- painel no celular ----------
  $('#sheetToggle').addEventListener('click', () => panel.classList.toggle('open'));

  // ---------- toast e feed ----------
  const toastEl = $('#toast');
  let toastT;
  function toast(msg, kind = '') {
    toastEl.textContent = msg;
    toastEl.className = 'toast show ' + kind;
    clearTimeout(toastT);
    toastT = setTimeout(() => (toastEl.className = 'toast'), 2600);
  }
  const feed = $('#feedRows');
  function event(msg, kind = '') {
    const d = new Date();
    const row = document.createElement('div');
    row.className = 'ev ' + kind;
    row.innerHTML = `<time>${d.toLocaleTimeString('pt-BR')}</time><span>${msg}</span>`;
    feed.prepend(row);
    while (feed.children.length > 6) feed.lastChild.remove();
  }

  // ---------- comandos ----------
  async function send(pin, value) {
    recentCmd[pin] = Date.now();
    try {
      const r = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, value }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'falha');
      return true;
    } catch (e) {
      toast(`Não foi possível enviar ${pin}: ${e.message}`, 'err');
      return false;
    }
  }
  async function setMode(auto) {
    await send('V3', auto ? 1 : 0);
  }
  async function toggle(d) {
    if (!d) return;
    const on = d.on(values);
    if (!d.anyMode && values.V3 === '1') {
      await setMode(false);
      toast('Modo manual ativado para controlar pelo painel');
    }
    await send(d.write, on ? 0 : 1);
  }
  DEVICES.forEach((d) => $(`#dev-${d.key}`).addEventListener('click', () => toggle(d)));
  modeAuto.addEventListener('click', () => setMode(true));
  modeManual.addEventListener('click', () => setMode(false));

  // ---------- cenas de um toque (I4) ----------
  let scenes = [];
  fetch('/api/scenes').then((r) => r.json()).then((list) => {
    scenes = list;
    $('#scenes').innerHTML = scenes.map((c) => `
      <button class="scene" id="sc-${c.id}" type="button" data-scene="${c.id}" title="${c.descricao}">
        ${svg(c.icone)}<span class="sname">${c.nome}</span><i class="sprog"></i>
      </button>`).join('');
    renderScenes();
  }).catch(() => { /* servidor sem cenas: a seção fica vazia */ });
  $('#scenes').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-scene]');
    if (!b || meta.scene) return;
    try {
      const r = await fetch('/api/scene', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: b.dataset.scene, origem: 'casa3d' }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'falha');
    } catch (err) {
      toast(`Cena não iniciada: ${err.message}`, 'err');
    }
  });
  function renderScenes() {
    const s = meta.scene;
    for (const c of scenes) {
      const el = $(`#sc-${c.id}`);
      const run = s?.id === c.id;
      el.classList.toggle('run', run);
      el.disabled = !!s && !run;
      el.querySelector('.sprog').style.width = run ? `${Math.round((s.passo / s.total) * 100)}%` : '0';
    }
  }

  // ---------- simulação (modo demonstração) ----------
  const sim = $('#sim');
  const simTemp = $('#simTemp'), simLuz = $('#simLuz'), simDist = $('#simDist'), simPres = $('#simPres');
  let simTimer;
  function simSend(body) {
    clearTimeout(simTimer);
    simTimer = setTimeout(() => fetch('/api/sim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), 60);
  }
  simTemp.addEventListener('input', () => { $('#simTempV').textContent = `${simTemp.value} °C`; simSend({ temp: simTemp.value }); });
  simLuz.addEventListener('input', () => { $('#simLuzV').textContent = `${simLuz.value} %`; simSend({ luz: simLuz.value }); });
  simDist.addEventListener('input', () => { $('#simDistV').textContent = `${simDist.value} cm`; simSend({ dist: simDist.value }); });
  const presOn = (e) => { e.preventDefault(); simPres.classList.add('on'); fetch('/api/sim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presenca: true }) }); };
  const presOff = () => { if (!simPres.classList.contains('on')) return; simPres.classList.remove('on'); fetch('/api/sim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presenca: false }) }); };
  simPres.addEventListener('pointerdown', presOn);
  addEventListener('pointerup', presOff);
  simPres.addEventListener('pointerleave', presOff);

  // ---------- render do estado ----------
  function describe(prev, v) {
    const who = (pin) => (meta.scene ? `cena ${meta.scene.nome}` : Date.now() - (recentCmd[pin] || 0) < 4000 ? 'pelo painel' : v.V3 === '1' ? 'automático' : 'no dispositivo');
    if (prev.V0 !== v.V0) event(v.V0 === '1' ? `Luz ligada — LED do D1 aceso (${who('V0')})` : `Luz desligada — LED do D1 apagado (${who('V0')})`, 'amber');
    if (prev.V1 !== v.V1) event(v.V1 === '1' ? `Porta destrancada — LED do D0 aceso (${who('V1')})` : `Porta trancada — LED do D0 apagado (${who('V1')})`);
    if (prev.V7 !== v.V7 && v.V7) event(v.V7 === 'ABERTA' ? `Servo girou 90° — janela aberta (${who('V2')})` : `Servo voltou a 0° — janela fechada (${who('V2')})`);
    if (prev.V3 !== v.V3) event(v.V3 === '1' ? 'Modo automático: regras de IoB assumem a casa' : 'Modo manual: comandos do painel/app', 'cyan');
    if (prev.V9 !== v.V9) event(v.V9 === '1' ? `Alarme armado (${who('V9')})` : `Alarme desarmado (${who('V9')})`);
    if (!/ATIVO/.test(prev.V8 || '') && /ATIVO/.test(v.V8 || '')) event('PIR com alarme armado — buzzer do D8 disparado', 'red');
    if (prev.V11 !== v.V11 && v.V11 === '1') event('PIR (D5) detectou movimento na entrada', 'cyan');
    const zp = garageZone(Number(prev.V12)), zv = garageZone(Number(v.V12));
    if (prev.V12 !== undefined && zp?.text !== zv?.text && zv) event(`HC-SR04 na garagem: ${zv.text} (${Math.round(Number(v.V12))} cm)`, zv.kind);
    if (prev.V6 !== v.V6 && v.V6) event(v.V6 === 'ESCURO' ? 'LDR: ambiente escuro' : 'LDR: ambiente claro');
  }

  function render() {
    const v = values;
    const temp = Number(v.V4), luz = Number(v.V10);
    $('#vTemp').textContent = fmt.temp(v.V4);
    $('#bTemp').style.width = `${Math.min(100, Math.max(0, ((temp - 10) / 35) * 100)) || 0}%`;
    $('#sTemp').classList.toggle('hot', temp >= 30);
    $('#vUmid').textContent = fmt.umid(v.V5);
    $('#vLuz').textContent = Number.isFinite(luz) ? Math.round(luz) : (v.V6 || '--');
    $('#bLuz').style.width = `${Number.isFinite(luz) ? luz : v.V6 === 'CLARO' ? 80 : 15}%`;
    $('#icLuz').innerHTML = svg(v.V6 === 'ESCURO' ? 'moon' : 'sun');
    const pres = v.V11 === '1';
    $('#vPres').textContent = fmt.pres(v.V11);
    $('#vPresAt').textContent = fmt.presInfo(v.V14, meta.presenceAt);
    $('#sPres').classList.toggle('alert', pres);

    const auto = v.V3 === '1';
    modeAuto.classList.toggle('on', auto);
    modeManual.classList.toggle('on', !auto);
    $('#modeHint').textContent = auto
      ? `As regras do firmware decidem: janela abre ≥ 30 °C e fecha ≤ 27 °C; luz acende com movimento no PIR${SENSORES.ldr ? ' quando o LDR indica escuro' : ''}.`
      : 'Você comanda cada atuador pelo painel ou pelo app Blynk.';

    for (const d of DEVICES) {
      const on = d.on(v);
      const el = $(`#dev-${d.key}`);
      el.classList.toggle('on', on);
      el.classList.toggle('locked', auto && !d.anyMode);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      $(`#st-${d.key}`).textContent = d.label(on, v);
      if (hot[d.key]) {
        hot[d.key].classList.toggle('on', on);
        hv[d.key].textContent = d.label(on, v);
      }
    }
    // faixa compacta
    $('#hT').textContent = fmt.temp(v.V4);
    $('#hU').textContent = fmt.umid(v.V5);
    $('#hL').textContent = Number.isFinite(luz) ? Math.round(luz) : '--';
    $('#hLi').innerHTML = svg(v.V6 === 'ESCURO' ? 'moon' : 'sun');
    $('#hP').textContent = pres ? 'movimento' : 'livre';
    $('#hPw').classList.toggle('alert', pres);
    $('#hMode').textContent = auto ? 'AUTO' : 'MANUAL';
    $('#hMode').classList.toggle('on', auto);
    for (const d of DEVICES) $(`#ha-${d.key}`).classList.toggle('on', d.on(v));

    for (const [k] of ROOMS) {
      const lvl = Number(meta.rooms?.[k]) || 0;
      $(`#room-${k}`).classList.toggle('on', lvl > 0);
      $(`#room-${k}`).setAttribute('aria-pressed', lvl > 0 ? 'true' : 'false');
      $(`#rl-${k}`).textContent = meta.rooms ? roomText(lvl) : '--';
    }

    const firing = /ATIVO/.test(v.V8 || '');
    $('#ha-alarme').classList.toggle('firing', firing);
    $('#dev-alarme').classList.toggle('firing', firing);
    hot.alarme.classList.toggle('firing', firing);
    document.body.classList.toggle('alarm', firing);

    hv.dht.textContent = `${fmt.temp(v.V4)} °C · ${fmt.umid(v.V5)}%`;
    hv.pir.textContent = pres ? 'movimento' : 'parado';
    hot.pir.classList.toggle('on', pres);
    const dist = Number(v.V12), z = garageZone(dist);
    $('#vCar').textContent = Number.isFinite(dist) && v.V12 !== '' ? Math.round(dist) : '--';
    $('#bCar').style.width = `${Number.isFinite(dist) ? Math.max(4, 100 - Math.min(100, dist / 2)) : 0}%`;
    $('#sCar').classList.toggle('alert', z?.kind === 'red');
    $('#hC').textContent = Number.isFinite(dist) && v.V12 !== '' ? Math.round(dist) : '--';
    $('#hCw').classList.toggle('alert', z?.kind === 'red');
    if (hot.garagem) {
      hv.garagem.textContent = z ? `${Math.round(dist)} cm · ${z.text}` : '--';
      hot.garagem.classList.toggle('on', !!z && z.kind !== '');
    }
    if (hv.ldr) hv.ldr.textContent = Number.isFinite(luz) ? `${Math.round(luz)}% · ${v.V6 || ''}` : v.V6 || '--';
    hv.mcu.textContent = meta.deviceOnline ? 'online' : 'offline';
    hot.mcu.classList.toggle('on', !!meta.deviceOnline);

    const live = meta.mode === 'live';
    chipLink.className = 'chip ' + (live ? (meta.blynkOnline ? 'ok' : 'bad') : 'demo');
    chipLink.querySelector('span').textContent = live ? (meta.blynkOnline ? 'Blynk ao vivo' : 'Blynk sem resposta') : 'Modo demonstração';
    chipDev.className = 'chip ' + (meta.deviceOnline ? 'ok' : 'bad');
    chipDev.querySelector('span').textContent = live ? (meta.deviceOnline ? 'NodeMCU online' : 'NodeMCU offline') : 'NodeMCU simulado';
    sim.hidden = live;
    $('#errBox').hidden = !meta.error;
    $('#errBox').textContent = meta.error ? `Blynk: ${meta.error}` : '';
  }

  function applyState(s) {
    const prev = values, prevScene = meta.scene, prevRooms = meta.rooms;
    const changed = JSON.stringify(prev) !== JSON.stringify(s.values);
    values = s.values || {};
    meta = s;
    lastStateAt = Date.now();
    const ORIGEM = { painel: 'pelo celular', casa3d: 'pela casa 3D', blynk: 'pelo Blynk' };
    if (!first && s.scene && s.scene.id !== prevScene?.id) event(`Cena ${s.scene.nome} iniciada ${ORIGEM[s.scene.origem] || ''}`, 'cyan');
    if (!first && changed) describe(prev, values);
    if (!first) {
      const mud = ROOMS.map(([k, n]) => [n, Number(prevRooms?.[k]) || 0, Number(s.rooms?.[k]) || 0]).filter(([, a, b]) => a !== b);
      // a luz geral (D1) mudou junto: os cômodos seguiram ela — um evento só, com a origem certa
      const viaGeral = prev.V0 !== values.V0;
      const who = (k) => (s.scene ? `cena ${s.scene.nome}` : viaGeral ? (values.V3 === '1' ? 'automático, pela luz geral' : 'pela luz geral')
        : Date.now() - (recentCmd[k] || 0) < 4000 ? 'pelo painel' : 'pelo celular');
      const txt = (b) => (b === 0 ? 'apagada' : b >= 100 ? 'acesa' : `a ${b}%`);
      if (viaGeral && !s.scene && mud.length > 1 && mud.every(([, , b]) => b === mud[0][2])) {
        event(`Cômodos com luz ${txt(mud[0][2])} (${who()})`, mud[0][2] ? 'amber' : '');
      } else {
        for (const [n, , b] of mud) event(`Luz ${txt(b)} — ${n.toLowerCase()} (${who(n.toLowerCase())})`, b ? 'amber' : '');
      }
    }
    if (!first && prevScene && !s.scene) event(`Cena ${prevScene.nome} concluída`, 'cyan');
    renderScenes();
    if (first) {
      event(s.mode === 'live' ? 'Conectado ao Blynk — espelhando o NodeMCU em tempo real' : 'Modo demonstração — sensores simulados com as regras do firmware', 'cyan');
      if (s.mode !== 'live') {
        simTemp.value = Math.round(Number(values.V4) || 24); $('#simTempV').textContent = `${simTemp.value} °C`;
        simLuz.value = Math.round(Number(values.V10) || 70); $('#simLuzV').textContent = `${simLuz.value} %`;
        simDist.value = Math.round(Number(values.V12) || 120); $('#simDistV').textContent = `${simDist.value} cm`;
      }
    }
    first = false;
    render();
    onState(values, meta, changed);
  }

  // ---------- conexão ----------
  let es, pollTimer;
  function connect() {
    try {
      es = new EventSource('/api/stream');
      es.addEventListener('state', (e) => applyState(JSON.parse(e.data)));
      es.onerror = () => {
        chipLink.className = 'chip bad';
        chipLink.querySelector('span').textContent = 'Reconectando…';
        if (!pollTimer) pollTimer = setInterval(poll, 2000);
      };
      es.onopen = () => { clearInterval(pollTimer); pollTimer = null; };
    } catch { pollTimer = setInterval(poll, 2000); }
  }
  async function poll() {
    try { applyState(await (await fetch('/api/state')).json()); } catch { /* servidor fora */ }
  }
  connect();

  setQuality(quality, qualityAuto);

  // ================================================================
  // Céu: segue o LDR (padrão), a hora do computador ou uma hora escolhida
  // ================================================================
  const skyStore = {
    get() { try { return JSON.parse(localStorage.getItem('casa3d.ceu') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('casa3d.ceu', JSON.stringify(v)); } catch { /* sem storage */ } },
  };
  const sky = Object.assign({ mode: SENSORES.ldr ? 'ldr' : 'relogio', hour: 12 }, skyStore.get());
  {
    const q = new URLSearchParams(location.search);
    if (['ldr', 'relogio', 'manual'].includes(q.get('ceu'))) sky.mode = q.get('ceu');
    if (q.has('hora')) { sky.hour = Number(q.get('hora')); sky.mode = 'manual'; }
    if (!SENSORES.ldr && sky.mode === 'ldr') sky.mode = 'relogio'; // céu pelo LDR só com o sensor
  }
  const fmtHour = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
  const skyHour = $('#skyHour');
  function applySky(save = true) {
    document.querySelectorAll('#skyMode button').forEach((b) => b.classList.toggle('on', b.dataset.sky === sky.mode));
    $('#skyManual').hidden = sky.mode !== 'manual';
    skyHour.value = sky.hour;
    $('#skyHourV').textContent = fmtHour(sky.hour);
    $('#skyHint').textContent = {
      ldr: 'O céu segue o LDR (A0) da placa: tampe o sensor e a casa anoitece.',
      relogio: 'O céu segue a hora deste computador; o sol nasce a leste e se põe a oeste.',
      manual: SENSORES.ldr ? 'Escolha a hora. Só muda a visualização: a regra da luz continua usando o LDR.' : 'Escolha a hora. Só muda a visualização da casa.',
    }[sky.mode];
    if (save) skyStore.set(sky);
    onSky?.({ ...sky });
  }
  // sensores desligados (SENSORES no .env): some tudo deles da tela — o código fica para religar
  {
    const off = [];
    if (!SENSORES.ldr) off.push('#sLuz', '#hLi', '#hL', '#skyMode [data-sky="ldr"]', 'label[for="simLuz"]', '#simLuz');
    if (!SENSORES.garagem) off.push('#sCar', '#hCw', 'label[for="simDist"]', '#simDist');
    for (const sel of off) document.querySelectorAll(sel).forEach((el) => { (el.closest('.hd') || el).hidden = true; });
  }
  $('#skyMode').addEventListener('click', (e) => { const b = e.target.closest('button[data-sky]'); if (b) { sky.mode = b.dataset.sky; applySky(); } });
  skyHour.addEventListener('input', () => { sky.hour = Number(skyHour.value); applySky(); });

  // ================================================================
  // Layouts: painel (completo) · compacto (faixa com dados) · foco (apresentação)
  // O painel pode ser arrastado pelo cabeçalho; solto perto da borda, encaixa.
  // ================================================================
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('casa3d.layout') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('casa3d.layout', JSON.stringify(v)); } catch { /* sem storage */ } },
  };
  const LAYOUTS = { painel: ['Painel', 'lPanel', '1'], compacto: ['Compacto', 'lCompact', '2'], foco: ['Foco', 'lFocus', '3'] };
  const pref = Object.assign({ layout: 'painel', dock: 'right', x: null, y: null, feed: true }, store.get());
  const qp = new URLSearchParams(location.search);
  if (LAYOUTS[qp.get('layout')]) pref.layout = qp.get('layout');
  if (['left', 'right'].includes(qp.get('dock'))) pref.dock = qp.get('dock');
  const hud = $('#hud'), layoutsEl = $('#layouts'), phead = $('#phead'), feedBox = $('#feed'), feedToggle = $('#feedToggle');
  const mobile = () => innerWidth <= 900;
  let freeDirty = true, free = { x: 0, y: 0, w: innerWidth, h: innerHeight };

  layoutsEl.innerHTML = Object.entries(LAYOUTS).map(([k, [name, ic, key]]) =>
    `<button type="button" data-layout="${k}" title="${name} (tecla ${key})" aria-label="${name}">${svg(ic)}<span>${name}</span></button>`).join('');
  $('#pMin').innerHTML = svg('min');
  $('#pDock').innerHTML = svg('swap');

  hud.innerHTML = `
    <div class="hud-data">
      <span class="hd" title="Temperatura · DHT11 (V4)">${svg('temp')}<b id="hT">--</b><small>°C</small></span>
      <span class="hd" title="Umidade · DHT11 (V5)">${svg('drop')}<b id="hU">--</b><small>%</small></span>
      <span class="hd" title="Luminosidade · LDR (V10)"><span id="hLi">${svg('sun')}</span><b id="hL">--</b><small>%</small></span>
      <span class="hd" id="hPw" title="Presença · PIR (V11)">${svg('radar')}<b id="hP">--</b></span>
      <span class="hd" id="hCw" title="Garagem · HC-SR04 (V12)">${svg('car')}<b id="hC">--</b><small>cm</small></span>
    </div>
    <div class="hud-acts">
      <button type="button" class="hmode" id="hMode" title="Alternar modo automático/manual">--</button>
      ${DEVICES.map((d) => `<button type="button" class="hact" id="ha-${d.key}" data-dev="${d.key}" title="${d.name} · ${d.hw}" aria-label="${d.name}">${svg(d.icon)}</button>`).join('')}
    </div>
    <button type="button" class="hud-exp" id="hudExp" title="Abrir painel (1)" aria-label="Abrir painel">${svg('expand')}</button>`;
  hud.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dev) toggle(DEVICES.find((d) => d.key === b.dataset.dev));
    else if (b.id === 'hMode') setMode(values.V3 !== '1');
    else if (b.id === 'hudExp') setLayout('painel');
  });

  function applyLayout() {
    const L = mobile() ? 'painel' : pref.layout;
    document.body.dataset.layout = L;
    document.body.dataset.dock = pref.dock;
    document.body.classList.toggle('tags', L === 'foco');
    hud.hidden = L === 'painel';
    panel.classList.toggle('dock-left', !mobile() && pref.dock === 'left');
    panel.classList.toggle('float', !mobile() && pref.dock === 'float');
    if (!mobile() && pref.dock === 'float' && pref.x !== null) {
      const r = clampFloat(pref.x, pref.y);
      panel.style.left = `${r.x}px`; panel.style.top = `${r.y}px`;
    } else { panel.style.left = ''; panel.style.top = ''; }
    feedBox.classList.toggle('collapsed', !pref.feed);
    feedToggle.setAttribute('aria-expanded', String(pref.feed));
    layoutsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.layout === L));
    freeDirty = true;
  }
  function save() { store.set({ layout: pref.layout, dock: pref.dock, x: pref.x, y: pref.y, feed: pref.feed }); }
  function setLayout(l) { pref.layout = l; applyLayout(); save(); }
  function clampFloat(x, y) {
    const w = panel.offsetWidth || 364, h = Math.min(panel.offsetHeight || 600, innerHeight - 36);
    return { x: Math.min(Math.max(12, x), innerWidth - w - 12), y: Math.min(Math.max(12, y), Math.max(12, innerHeight - h - 12)) };
  }

  layoutsEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-layout]'); if (b) setLayout(b.dataset.layout); });
  $('#pMin').addEventListener('click', () => setLayout('compacto'));
  $('#pDock').addEventListener('click', () => { pref.dock = pref.dock === 'right' ? 'left' : 'right'; pref.x = pref.y = null; applyLayout(); save(); });
  feedToggle.addEventListener('click', () => { pref.feed = !pref.feed; applyLayout(); save(); });
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = { 1: 'painel', 2: 'compacto', 3: 'foco' }[e.key];
    if (k) setLayout(k);
  });
  addEventListener('resize', applyLayout);
  for (const el of [panel, hud]) el.addEventListener('transitionend', () => (freeDirty = true));
  $('#sheetToggle').addEventListener('click', () => setTimeout(() => (freeDirty = true), 500));

  // arrastar o painel pelo cabeçalho
  let drag = null;
  phead.addEventListener('pointerdown', (e) => {
    if (mobile() || e.button !== 0 || e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    phead.setPointerCapture(e.pointerId);
  });
  phead.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved) {
      drag.moved = true;
      panel.classList.add('dragging');
      pref.dock = 'float';
      applyLayout();
    }
    const r = clampFloat(e.clientX - drag.dx, e.clientY - drag.dy);
    pref.x = r.x; pref.y = r.y;
    panel.style.left = `${r.x}px`; panel.style.top = `${r.y}px`;
    document.body.dataset.snap = e.clientX < 90 ? 'left' : e.clientX > innerWidth - 90 ? 'right' : '';
    freeDirty = true;
  });
  const endDrag = (e) => {
    if (!drag) return;
    panel.classList.remove('dragging');
    if (drag.moved) {
      if (e.clientX < 90) pref.dock = 'left';
      else if (e.clientX > innerWidth - 90) pref.dock = 'right';
      if (pref.dock !== 'float') pref.x = pref.y = null;
      applyLayout(); save();
    }
    document.body.dataset.snap = '';
    drag = null;
  };
  phead.addEventListener('pointerup', endDrag);
  phead.addEventListener('pointercancel', endDrag);
  phead.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) { pref.dock = 'right'; pref.x = pref.y = null; applyLayout(); save(); } });

  // Área livre da tela (sem painéis): a câmera centraliza a cena nela.
  // Recalculada só quando algo muda (ler o layout a cada quadro custaria desempenho).
  function measureFree() {
    const w = innerWidth, h = innerHeight;
    let l = 0, r = w, t = 0, b = h;
    if (!mobile()) { t = 70; b = h - 80; }
    const rects = [];
    const add = (el) => { if (!el || el.hidden) return; const rc = el.getBoundingClientRect(); if (rc.width > 2 && rc.height > 2) rects.push(rc); };
    // a faixa compacta é pequena e fica no canto: não desloca a cena (só o painel completo desloca)
    if (document.body.dataset.layout === 'painel') add(panel);
    if (mobile()) add($('#views'));
    for (const rc of rects) {
      if (rc.height > h * 0.45 && rc.width < w * 0.6) {           // coluna lateral
        if (rc.left + rc.width / 2 > w / 2) r = Math.min(r, rc.left - 12); else l = Math.max(l, rc.right + 12);
      } else if (rc.top > h * 0.5) b = Math.min(b, rc.top - 8);   // faixa embaixo
      else t = Math.max(t, rc.bottom + 8);                          // faixa em cima
    }
    if (r - l < 200) { l = 0; r = w; }
    if (b - t < 160) { t = 0; b = h; }
    free = { x: l, y: t, w: r - l, h: b - t };
    freeDirty = false;
  }
  let freeTimer = 0;

  applyLayout();
  applySky(false);

  return {
    freeRect(dt = 0) {
      freeTimer += dt;
      if (freeDirty || freeTimer > 1) { freeTimer = 0; measureFree(); }
      return free;
    },
    setLayout,
    setQuality,
    setFps(v) { qBtn.textContent = `${qLabel} · ${Math.round(v)} FPS`; },
    ready() {
      document.body.classList.add('ready');
      // depois da animação de entrada, as transições de layout ficam rápidas e a área livre é medida de novo
      setTimeout(() => { document.body.classList.add('settled'); freeDirty = true; }, 2600);
    },
    tick() {
      if (!lastStateAt) return;
      const s = Math.round((Date.now() - lastStateAt) / 1000);
      chipAge.querySelector('span').textContent = s < 2 ? 'sincronizado agora' : `última leitura há ${s}s`;
      $('#vPresAt').textContent = fmt.presInfo(values.V14, meta.presenceAt); // "há X s" anda sozinho
    },
  };
}
