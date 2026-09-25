// Interface: conexão em tempo real (SSE), painel, hotspots, eventos e simulação.

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
  auto: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5"/>',
};
const svg = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

const DEVICES = [
  { key: 'luz', pin: 'V0', write: 'V0', icon: 'bulb', name: 'Iluminação', hw: 'LED · GPIO 15', on: (v) => v.V0 === '1', label: (on) => (on ? 'Ligada' : 'Desligada') },
  { key: 'porta', pin: 'V1', write: 'V1', icon: 'door', name: 'Porta', hw: 'LED trava · GPIO 16', on: (v) => v.V1 === '1', label: (on) => (on ? 'Destrancada' : 'Trancada') },
  { key: 'janela', pin: 'V7', write: 'V2', icon: 'window', name: 'Janela', hw: 'Servo SG90 · GPIO 7', on: (v) => v.V7 === 'ABERTA', label: (on) => (on ? 'Aberta' : 'Fechada') },
  { key: 'alarme', pin: 'V9', write: 'V9', icon: 'siren', name: 'Alarme', hw: 'Buzzer · GPIO 17', on: (v) => v.V9 === '1', label: (on, v) => (/ATIVO/.test(v.V8 || '') ? 'DISPARADO' : on ? 'Armado' : 'Desarmado'), anyMode: true },
];

export function createUI({ quality, views, onView, addHotspot, onState }) {
  const $ = (s) => document.querySelector(s);
  const panel = $('#panel');
  let values = {}, meta = {}, lastStateAt = 0, first = true;
  const recentCmd = {};

  // ---------- chips de conexão ----------
  const chipLink = $('#chipLink'), chipDev = $('#chipDev'), chipAge = $('#chipAge');

  // ---------- sensores ----------
  $('#sensors').innerHTML = `
    <div class="sensor big" id="sTemp">${svg('temp')}<div><div class="k">Temperatura <span class="hw">DHT22 · V4</span></div><div class="v"><span id="vTemp">--</span><small>°C</small></div><div class="bar"><i id="bTemp"></i></div></div></div>
    <div class="sensor" id="sUmid">${svg('drop')}<div><div class="k">Umidade <span class="hw">V5</span></div><div class="v sm"><span id="vUmid">--</span><small>%</small></div></div></div>
    <div class="sensor" id="sLuz"><span id="icLuz">${svg('sun')}</span><div><div class="k">Luminosidade <span class="hw">LDR · V10</span></div><div class="v sm"><span id="vLuz">--</span><small>%</small></div><div class="bar"><i id="bLuz"></i></div></div></div>
    <div class="sensor" id="sPres">${svg('radar')}<div><div class="k">Presença <span class="hw">HC-SR04 · V11</span></div><div class="v sm" id="vPres">--</div></div></div>`;

  // ---------- dispositivos ----------
  $('#devices').innerHTML = DEVICES.map((d) => `
    <button class="device" id="dev-${d.key}" type="button" aria-pressed="false">
      <span class="dicon">${svg(d.icon)}</span>
      <span class="dtext"><span class="dname">${d.name}</span><span class="dhw">${d.hw}</span></span>
      <span class="dstate" id="st-${d.key}">--</span>
      <span class="switch"><i></i></span>
    </button>`).join('');

  const modeAuto = $('#modeAuto'), modeManual = $('#modeManual');

  // ---------- hotspots na cena ----------
  const hot = {};
  const HOT = [
    { key: 'luz', anchor: 'tv', title: 'Iluminação', act: true, dev: 'luz' },
    { key: 'porta', anchor: 'porta', title: 'Porta · trava', act: true, dev: 'porta' },
    { key: 'janela', anchor: 'janela', title: 'Janela · servo', act: true, dev: 'janela' },
    { key: 'alarme', anchor: 'alarme', title: 'Sirene · buzzer', act: true, dev: 'alarme' },
    { key: 'dht22', anchor: 'dht22', title: 'DHT22' },
    { key: 'hcsr04', anchor: 'hcsr04', title: 'HC-SR04' },
    { key: 'ldr', anchor: 'ldr', title: 'LDR' },
    { key: 'esp32', anchor: 'esp32', title: 'ESP32-S3' },
  ];
  for (const h of HOT) {
    const el = document.createElement('div');
    el.className = 'hotspot' + (h.act ? ' act' : '');
    el.innerHTML = `<span class="dot"></span><span class="tag"><b>${h.title}</b><em id="hv-${h.key}">--</em></span>`;
    if (h.act) el.addEventListener('click', (e) => { e.stopPropagation(); toggle(DEVICES.find((d) => d.key === h.dev)); });
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
  const qBtn = $('#quality');
  qBtn.textContent = quality === 'high' ? 'Qualidade: alta' : 'Qualidade: leve';
  qBtn.addEventListener('click', () => {
    const p = new URLSearchParams(location.search);
    p.set('q', quality === 'high' ? 'low' : 'high');
    location.search = p.toString();
  });

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
  const feed = $('#feed');
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

  // ---------- simulação (modo demonstração) ----------
  const sim = $('#sim');
  const simTemp = $('#simTemp'), simLuz = $('#simLuz'), simPres = $('#simPres');
  let simTimer;
  function simSend(body) {
    clearTimeout(simTimer);
    simTimer = setTimeout(() => fetch('/api/sim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), 60);
  }
  simTemp.addEventListener('input', () => { $('#simTempV').textContent = `${simTemp.value} °C`; simSend({ temp: simTemp.value }); });
  simLuz.addEventListener('input', () => { $('#simLuzV').textContent = `${simLuz.value} %`; simSend({ luz: simLuz.value }); });
  const presOn = (e) => { e.preventDefault(); simPres.classList.add('on'); fetch('/api/sim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presenca: true }) }); };
  const presOff = () => { if (!simPres.classList.contains('on')) return; simPres.classList.remove('on'); fetch('/api/sim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presenca: false }) }); };
  simPres.addEventListener('pointerdown', presOn);
  addEventListener('pointerup', presOff);
  simPres.addEventListener('pointerleave', presOff);

  // ---------- render do estado ----------
  function describe(prev, v) {
    const who = (pin) => (Date.now() - (recentCmd[pin] || 0) < 4000 ? 'pelo painel' : v.V3 === '1' ? 'automático' : 'no dispositivo');
    if (prev.V0 !== v.V0) event(v.V0 === '1' ? `Luz ligada — LED do GPIO 15 aceso (${who('V0')})` : `Luz desligada — LED do GPIO 15 apagado (${who('V0')})`, 'amber');
    if (prev.V1 !== v.V1) event(v.V1 === '1' ? `Porta destrancada (${who('V1')})` : `Porta trancada (${who('V1')})`);
    if (prev.V7 !== v.V7 && v.V7) event(v.V7 === 'ABERTA' ? `Servo girou 90° — janela aberta (${who('V2')})` : `Servo voltou a 0° — janela fechada (${who('V2')})`);
    if (prev.V3 !== v.V3) event(v.V3 === '1' ? 'Modo automático: regras de IoB assumem a casa' : 'Modo manual: comandos do painel/app', 'cyan');
    if (prev.V9 !== v.V9) event(v.V9 === '1' ? 'Alarme armado' : 'Alarme desarmado');
    if (!/ATIVO/.test(prev.V8 || '') && /ATIVO/.test(v.V8 || '')) event('Presença com alarme armado — sirene disparada', 'red');
    if (prev.V11 !== v.V11 && v.V11 === '1') event('HC-SR04 detectou aproximação na entrada', 'cyan');
    if (prev.V6 !== v.V6 && v.V6) event(v.V6 === 'ESCURO' ? 'LDR: ambiente escuro' : 'LDR: ambiente claro');
  }

  function render() {
    const v = values;
    const temp = Number(v.V4), umid = Number(v.V5), luz = Number(v.V10);
    $('#vTemp').textContent = Number.isFinite(temp) ? temp.toFixed(1) : '--';
    $('#bTemp').style.width = `${Math.min(100, Math.max(0, ((temp - 10) / 35) * 100)) || 0}%`;
    $('#sTemp').classList.toggle('hot', temp >= 30);
    $('#vUmid').textContent = Number.isFinite(umid) ? Math.round(umid) : '--';
    $('#vLuz').textContent = Number.isFinite(luz) ? Math.round(luz) : (v.V6 || '--');
    $('#bLuz').style.width = `${Number.isFinite(luz) ? luz : v.V6 === 'CLARO' ? 80 : 15}%`;
    $('#icLuz').innerHTML = svg(v.V6 === 'ESCURO' ? 'moon' : 'sun');
    const pres = v.V11 === '1';
    $('#vPres').textContent = pres ? 'Detectada' : 'Livre';
    $('#sPres').classList.toggle('alert', pres);

    const auto = v.V3 === '1';
    modeAuto.classList.toggle('on', auto);
    modeManual.classList.toggle('on', !auto);
    $('#modeHint').textContent = auto
      ? 'As regras do firmware decidem sozinhas: janela abre ≥ 30 °C, luz acende no escuro.'
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
        document.getElementById(`hv-${d.key}`).textContent = d.label(on, v);
      }
    }
    const firing = /ATIVO/.test(v.V8 || '');
    $('#dev-alarme').classList.toggle('firing', firing);
    hot.alarme.classList.toggle('firing', firing);
    document.body.classList.toggle('alarm', firing);

    document.getElementById('hv-dht22').textContent = `${Number.isFinite(temp) ? temp.toFixed(1) : '--'} °C · ${Number.isFinite(umid) ? Math.round(umid) : '--'}%`;
    document.getElementById('hv-hcsr04').textContent = pres ? 'presença' : 'livre';
    hot.hcsr04.classList.toggle('on', pres);
    document.getElementById('hv-ldr').textContent = Number.isFinite(luz) ? `${Math.round(luz)}% · ${v.V6 || ''}` : v.V6 || '--';
    document.getElementById('hv-esp32').textContent = meta.deviceOnline ? 'online' : 'offline';
    hot.esp32.classList.toggle('on', !!meta.deviceOnline);

    const live = meta.mode === 'live';
    chipLink.className = 'chip ' + (live ? (meta.blynkOnline ? 'ok' : 'bad') : 'demo');
    chipLink.querySelector('span').textContent = live ? (meta.blynkOnline ? 'Blynk ao vivo' : 'Blynk sem resposta') : 'Modo demonstração';
    chipDev.className = 'chip ' + (meta.deviceOnline ? 'ok' : 'bad');
    chipDev.querySelector('span').textContent = live ? (meta.deviceOnline ? 'ESP32-S3 online' : 'ESP32-S3 offline') : 'ESP32 simulado';
    sim.hidden = live;
    $('#errBox').hidden = !meta.error;
    $('#errBox').textContent = meta.error ? `Blynk: ${meta.error}` : '';
  }

  function applyState(s) {
    const prev = values;
    const changed = JSON.stringify(prev) !== JSON.stringify(s.values);
    values = s.values || {};
    meta = s;
    lastStateAt = Date.now();
    if (!first && changed) describe(prev, values);
    if (first) {
      event(s.mode === 'live' ? 'Conectado ao Blynk — espelhando o ESP32-S3 em tempo real' : 'Modo demonstração — sensores simulados com as regras do firmware', 'cyan');
      if (s.mode !== 'live') {
        simTemp.value = Math.round(Number(values.V4) || 24); $('#simTempV').textContent = `${simTemp.value} °C`;
        simLuz.value = Math.round(Number(values.V10) || 70); $('#simLuzV').textContent = `${simLuz.value} %`;
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

  return {
    ready() { document.body.classList.add('ready'); },
    tick() {
      if (!lastStateAt) return;
      const s = Math.round((Date.now() - lastStateAt) / 1000);
      chipAge.querySelector('span').textContent = s < 2 ? 'sincronizado agora' : `última leitura há ${s}s`;
    },
  };
}
