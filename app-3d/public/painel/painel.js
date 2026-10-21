// Painel do celular (/painel): estado ao vivo por SSE, atuadores, modo automático/manual e alarme — sem 3D.
// Mesma regra do painel da casa 3D (js/ui.js): comando de atuador no modo automático passa antes para o manual.
import { fmt } from '/js/format.js';
import { SENSORES } from '/js/config.js';

const $ = (s) => document.querySelector(s);

const ICON = {
  temp: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  drop: '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  radar: '<path d="M4.9 19.1a10 10 0 1 1 14.2 0"/><path d="M8.5 15.5a5 5 0 1 1 7 0"/><circle cx="12" cy="12" r="1.5"/>',
  car: '<path d="M5 16V12l2-5h10l2 5v4"/><path d="M3 16h18v2H3z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/><path d="M5 12h14"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  door: '<path d="M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="13" cy="12" r="1"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  siren: '<path d="M6 18v-5a6 6 0 0 1 12 0v5"/><path d="M4 21h16M12 3v2M4.5 6.5l1.4 1.4M19.5 6.5l-1.4 1.4"/>',
  // cenas (o servidor manda o nome do ícone em /api/scenes)
  chegar: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  lua: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
};
const svg = (k) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

// os mesmos atuadores do painel da casa 3D (js/ui.js); pin = de onde vem o estado, write = para onde vai o comando
const DEVICES = [
  { key: 'luz', pin: 'V0', write: 'V0', icon: 'bulb', name: 'Luz geral', hw: 'LED · D1 · V0 · todos os cômodos', on: (v) => v.V0 === '1', label: (on) => (on ? 'Ligada' : 'Desligada') },
  { key: 'porta', pin: 'V1', write: 'V1', icon: 'door', name: 'Porta', hw: 'Trava · D0 · V1', on: (v) => v.V1 === '1', label: (on) => (on ? 'Destrancada' : 'Trancada') },
  { key: 'janela', pin: 'V7', write: 'V2', icon: 'window', name: 'Janela', hw: 'Servo · D7 · V2', on: (v) => v.V7 === 'ABERTA', label: (on, v) => fmt.janela(v.V7) },
  { key: 'alarme', pin: 'V9', write: 'V9', icon: 'siren', name: 'Alarme', hw: 'Buzzer · D8 · V9', on: (v) => v.V9 === '1', label: (on, v) => { const t = fmt.alarme(v.V8, v.V9); return t === 'Disparado' ? 'DISPARADO' : t; }, anyMode: true },
];

// luzes por cômodo (nível 0–100 em state.rooms): qualquer uma acesa mantém o LED do D1 (luz geral) aceso
const ROOMS = [
  { key: 'sala', name: 'Sala' },
  { key: 'cozinha', name: 'Cozinha' },
  { key: 'quarto', name: 'Quarto' },
  { key: 'externa', name: 'Externa' },
];

let values = {}, meta = {}, lastStateAt = 0, online = false, firing = false;
const pending = {}; // comando enviado e ainda não confirmado pelo estado: key → { want, until }
const pendingRoom = {}; // idem para os cômodos: key → { want (nível), until }

// ---------- montagem ----------
$('#sensors').innerHTML = `
  <div class="sensor big" id="sTemp">${svg('temp')}<div><div class="k">Temperatura <span class="hw">DHT11 · D2 · V4</span></div><div class="v"><span id="vTemp">--</span><small>°C</small></div><div class="bar"><i id="bTemp"></i></div></div></div>
  <div class="sensor" id="sUmid">${svg('drop')}<div><div class="k">Umidade</div><div class="v sm"><span id="vUmid">--</span><small>%</small></div></div></div>
  <div class="sensor" id="sPres">${svg('radar')}<div><div class="k">Presença</div><div class="v sm" id="vPres">--</div><div class="sub" id="vDet" hidden></div></div></div>
  ${SENSORES.ldr ? `<div class="sensor" id="sLuz"><span id="icLuz">${svg('sun')}</span><div><div class="k">Luminosidade</div><div class="v sm"><span id="vLuz">--</span><small>%</small></div></div></div>` : ''}
  ${SENSORES.garagem ? `<div class="sensor" id="sCar">${svg('car')}<div><div class="k">Garagem</div><div class="v sm"><span id="vCar">--</span><small>cm</small></div></div></div>` : ''}`;

const tile = (id, icon, name, hw) => `
  <button class="device" id="${id}" type="button" aria-pressed="false">
    <span class="drow"><span class="dicon">${svg(icon)}</span><span class="switch"><i></i></span></span>
    <span class="dtext"><span class="dname">${name}</span><span class="dstate" id="st-${id}">--</span><span class="dhw">${hw}</span></span>
  </button>`;
const luzGeral = DEVICES.find((d) => d.key === 'luz');
// luz geral em faixa: ícone, texto e interruptor numa linha só
$('#lights').innerHTML = `
  <button class="device geral" id="dev-luz" type="button" aria-pressed="false">
    <span class="dicon">${svg(luzGeral.icon)}</span>
    <span class="dtext"><span class="dname">${luzGeral.name}</span><span class="dstate" id="st-dev-luz">--</span><span class="dhw">${luzGeral.hw}</span></span>
    <span class="switch"><i></i></span>
  </button>`
  + ROOMS.map((r) => tile(`room-${r.key}`, 'bulb', r.name, 'acende o D1')).join('');
$('#devices').innerHTML = DEVICES.filter((d) => d !== luzGeral).map((d) => tile(`dev-${d.key}`, d.icon, d.name, d.hw)).join('');

const modeAuto = $('#modeAuto'), modeManual = $('#modeManual');
const chipLink = $('#chipLink'), chipDev = $('#chipDev'), chipAge = $('#chipAge');

// ---------- toast ----------
const toastEl = $('#toast');
let toastT;
function toast(msg, kind = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + kind;
  clearTimeout(toastT);
  toastT = setTimeout(() => (toastEl.className = 'toast'), 2800);
}

// ---------- comandos ----------
async function send(pin, value) {
  try {
    const r = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return true;
  } catch (e) {
    toast(`Não foi possível enviar ${pin}: ${e.message}`, 'err');
    return false;
  }
}
async function setMode(auto) {
  if ((values.V3 === '1') === auto) return;
  navigator.vibrate?.(12);
  await send('V3', auto ? 1 : 0);
}
async function toggle(d) {
  if (pending[d.key]) return;
  const want = !d.on(values);
  pending[d.key] = { want, until: Date.now() + 6000 };
  navigator.vibrate?.(12);
  render();
  let ok = true;
  if (!d.anyMode && values.V3 === '1') {
    ok = await send('V3', 0);
    if (ok) toast('Modo manual ativado para controlar pelo painel');
  }
  if (ok) ok = await send(d.write, want ? 1 : 0);
  if (!ok) { delete pending[d.key]; render(); }
}
DEVICES.forEach((d) => $(`#dev-${d.key}`).addEventListener('click', () => toggle(d)));

// ---------- luzes por cômodo ----------
async function sendRoom(room, level) {
  try {
    const r = await fetch('/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room, level }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return true;
  } catch (e) {
    toast(`Não foi possível mudar a luz: ${e.message}`, 'err');
    return false;
  }
}
const roomLevel = (k) => Number(meta.rooms?.[k]) || 0;
async function toggleRoom(r) {
  if (pendingRoom[r.key]) return;
  const want = roomLevel(r.key) > 0 ? 0 : 100;
  // o servidor passa para o manual quando o cômodo muda a luz geral (o firmware só aceita a luz no manual)
  const geralDepois = ROOMS.some((x) => (x.key === r.key ? want : roomLevel(x.key)) > 0);
  if (values.V3 === '1' && geralDepois !== (values.V0 === '1')) toast('Modo manual ativado para controlar pelo painel');
  pendingRoom[r.key] = { want, until: Date.now() + 6000 };
  navigator.vibrate?.(12);
  render();
  if (!(await sendRoom(r.key, want))) { delete pendingRoom[r.key]; render(); }
}
ROOMS.forEach((r) => $(`#room-${r.key}`).addEventListener('click', () => toggleRoom(r)));

// ---------- cenas de um toque (I4) ----------
let scenes = [], loadingScenes = false;
async function loadScenes() {
  if (loadingScenes) return;
  loadingScenes = true;
  try {
    const r = await fetch('/api/scenes', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    scenes = await r.json();
  } catch { return; } // sem servidor: tenta de novo no próximo estado
  finally { loadingScenes = false; }
  $('#scenes').innerHTML = scenes.map((c) => `
    <button class="scene" id="sc-${c.id}" type="button" data-scene="${c.id}" title="${c.descricao}">
      <span class="sicon">${svg(c.icone)}</span>
      <span class="sname">${c.nome}</span>
      <span class="sdesc">${c.descricao}</span>
      <i class="sprog"></i>
    </button>`).join('');
  render();
}
$('#scenes').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-scene]');
  if (!b || meta.scene) return;
  navigator.vibrate?.(12);
  try {
    const r = await fetch('/api/scene', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: b.dataset.scene, origem: 'painel' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    toast(`Cena ${j.nome} em andamento`);
  } catch (err) {
    toast(`Cena não iniciada: ${err.message}`, 'err');
  }
});
let lastScene = null;
function renderScenes() {
  const s = meta.scene;
  for (const c of scenes) {
    const el = $(`#sc-${c.id}`);
    const run = s?.id === c.id;
    el.classList.toggle('run', run);
    el.disabled = !!s && !run;
    el.querySelector('.sprog').style.width = run ? `${Math.round((s.passo / s.total) * 100)}%` : '0';
  }
  if (lastScene && !s) toast(`Cena ${lastScene.nome} concluída`);
  lastScene = s || null;
}
modeAuto.addEventListener('click', () => setMode(true));
modeManual.addEventListener('click', () => setMode(false));

// ---------- render ----------
function render() {
  const v = values;
  const temp = Number(v.V4);
  $('#vTemp').textContent = fmt.temp(v.V4);
  $('#bTemp').style.width = `${Math.min(100, Math.max(0, ((temp - 10) / 35) * 100)) || 0}%`;
  $('#sTemp').classList.toggle('hot', temp >= 30);
  $('#vUmid').textContent = fmt.umid(v.V5);
  const pres = v.V11 === '1';
  $('#vPres').textContent = fmt.pres(v.V11);
  $('#sPres').classList.toggle('alert', pres);
  // detecções do dia (V14, se o datastream existir) + "última há X s" (B5)
  const info = fmt.presInfo(v.V14, meta.presenceAt);
  $('#vDet').hidden = !info;
  $('#vDet').textContent = info;
  if (SENSORES.ldr) {
    const luz = Number(v.V10);
    $('#vLuz').textContent = Number.isFinite(luz) && v.V10 !== undefined ? Math.round(luz) : v.V6 || '--';
    $('#icLuz').innerHTML = svg(v.V6 === 'ESCURO' ? 'moon' : 'sun');
  }
  if (SENSORES.garagem) {
    const dist = Number(v.V12);
    $('#vCar').textContent = Number.isFinite(dist) && v.V12 !== undefined && v.V12 !== '' ? Math.round(dist) : '--';
  }

  // antes da 1ª leitura (ou sem servidor) nada é marcado: "Manual"/"Desligada" seria mentira
  const auto = v.V3 === '1', modeKnown = v.V3 !== undefined;
  modeAuto.classList.toggle('on', modeKnown && auto);
  modeManual.classList.toggle('on', modeKnown && !auto);
  $('#modeHint').textContent = !modeKnown ? 'Aguardando a primeira leitura da placa…' : auto
    ? `As regras do firmware decidem: janela abre ≥ 30 °C e fecha ≤ 27 °C; luz acende com movimento no PIR${SENSORES.ldr ? ' quando o LDR indica escuro' : ''}. Tocar num controle passa para o manual.`
    : 'Você comanda cada atuador por aqui, pela casa 3D ou pelo app Blynk.';

  const now = Date.now();
  for (const d of DEVICES) {
    const on = d.on(v);
    const p = pending[d.key];
    if (p && (on === p.want || now > p.until)) delete pending[d.key];
    const el = $(`#dev-${d.key}`);
    el.classList.toggle('on', on);
    el.classList.toggle('locked', auto && !d.anyMode);
    el.classList.toggle('pending', !!pending[d.key]);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
    $(`#st-dev-${d.key}`).textContent = pending[d.key] ? 'enviando…' : v[d.pin] === undefined ? '--' : d.label(on, v);
  }
  for (const r of ROOMS) {
    const lvl = roomLevel(r.key);
    const p = pendingRoom[r.key];
    if (p && (lvl === p.want || now > p.until)) delete pendingRoom[r.key];
    const el = $(`#room-${r.key}`);
    el.classList.toggle('on', lvl > 0);
    el.classList.toggle('pending', !!pendingRoom[r.key]);
    el.setAttribute('aria-pressed', lvl > 0 ? 'true' : 'false');
    $(`#st-room-${r.key}`).textContent = pendingRoom[r.key] ? 'enviando…' : !meta.rooms ? '--' : lvl === 0 ? 'Desligada' : lvl >= 100 ? 'Ligada' : `${lvl} %`;
  }

  const nowFiring = /ATIVO/.test(v.V8 || '');
  if (nowFiring && !firing) navigator.vibrate?.([300, 120, 300]);
  firing = nowFiring;
  $('#dev-alarme').classList.toggle('firing', firing);
  document.body.classList.toggle('alarm', firing);

  const live = meta.mode === 'live';
  document.body.classList.toggle('offline', !online);
  if (!online) {
    chipLink.className = 'chip bad';
    chipLink.querySelector('span').textContent = !navigator.onLine ? 'Sem internet' : lastStateAt ? 'Reconectando…' : 'Conectando…';
  } else {
    chipLink.className = 'chip ' + (live ? (meta.blynkOnline ? 'ok' : 'bad') : 'demo');
    chipLink.querySelector('span').textContent = live ? (meta.blynkOnline ? 'Blynk ao vivo' : 'Blynk sem resposta') : 'Modo demonstração';
  }
  chipDev.className = 'chip ' + (!meta.mode ? '' : meta.deviceOnline ? 'ok' : 'bad');
  chipDev.querySelector('span').textContent = !meta.mode ? 'NodeMCU' : live ? (meta.deviceOnline ? 'NodeMCU online' : 'NodeMCU offline') : 'NodeMCU simulado';
  $('#errBox').hidden = !meta.error;
  $('#errBox').textContent = meta.error ? `Blynk: ${meta.error}` : '';
  if (online && !scenes.length) loadScenes();
  renderScenes();
  tick();
}

// idade da leitura (o servidor manda um batimento a cada 3 s; sem ele por 8 s, o elo caiu)
function tick() {
  const info = fmt.presInfo(values.V14, meta.presenceAt);
  if (info) $('#vDet').textContent = info; // "há X s" anda sozinho
  const s = Math.round((Date.now() - lastStateAt) / 1000);
  chipAge.querySelector('span').textContent = !lastStateAt ? 'aguardando dados'
    : s > 8 ? `sem sinal há ${s}s`
    : `leitura ${fmt.hora(meta.readAt)}`;
}
setInterval(() => {
  const now = Date.now();
  if ([...Object.values(pending), ...Object.values(pendingRoom)].some((p) => now > p.until)) render();
  else tick();
}, 1000);

// ---------- conexão ----------
function applyState(s) {
  values = s.values || {};
  meta = s;
  lastStateAt = Date.now();
  online = true;
  render();
}
function setOffline() {
  if (!online) return;
  online = false;
  render();
}

let es, pollTimer;
function connect() {
  es?.close();
  es = new EventSource('/api/stream');
  es.addEventListener('state', (e) => applyState(JSON.parse(e.data)));
  es.onopen = () => { clearInterval(pollTimer); pollTimer = null; };
  es.onerror = () => {
    setOffline();
    if (!pollTimer) pollTimer = setInterval(poll, 2000);
  };
}
async function poll() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    applyState(await r.json());
    // o EventSource desiste em erro HTTP (ex.: 401); com o servidor de volta, abre de novo
    if (es.readyState === EventSource.CLOSED) connect();
  } catch { setOffline(); }
}
// no celular a página dorme em segundo plano; ao voltar, reabre o stream se ficou parado
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastStateAt > 5000) connect();
});
connect();
render();

// ---------- app instalável (PWA) ----------
// o service worker e a instalação só existem em HTTPS ou localhost
if ('serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.register('/painel/sw.js', { scope: '/painel/' }).catch(() => { /* segue sem cache */ });
}
let installEvt = null;
const installBtn = $('#install');
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; installBtn.hidden = false; });
addEventListener('appinstalled', () => { installEvt = null; installBtn.hidden = true; toast('Painel instalado na tela inicial'); });
installBtn.addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null;
  installBtn.hidden = true;
});
