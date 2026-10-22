// Insights do dia e alertas (I7) no painel do celular.
// Alertas chegam pelo stream (state.alertas) e aparecem no topo da aba Casa, com vibração e — se o usuário
// permitir — notificação do sistema (pelo service worker). O push do Blynk fica para o bloco do Blynk (K3).
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

export function criarInsights({ toast }) {
  let aberto = false, dia = 'hoje', vistos = null;

  // ---------- alertas ----------
  $('#alertasCasa').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-alerta]');
    if (!b) return;
    navigator.vibrate?.(12);
    b.disabled = true;
    try {
      const r = await fetch(`/api/alertas/${encodeURIComponent(b.dataset.alerta)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resposta: b.dataset.resp }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (b.dataset.resp === 'executar') toast('Feito');
    } catch (err) { toast(`Não foi possível: ${err.message}`, 'err'); b.disabled = false; }
  });

  async function notificar(a) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    const opts = { body: a.texto, tag: `casa-${a.id}`, icon: '/painel/icones/icone-192.png', badge: '/painel/icones/icone-192.png', renotify: true };
    try {
      const reg = await navigator.serviceWorker?.getRegistration('/painel/');
      if (reg) await reg.showNotification(a.titulo, opts); else new Notification(a.titulo, opts);
    } catch { /* sem permissão ou sem suporte */ }
  }

  function alertas(lista = []) {
    $('#alertasCasa').hidden = !lista.length;
    $('#alertasCasa').innerHTML = lista.map((a) => `
      <div class="card alerta ${a.nivel}">
        <b>${esc(a.titulo)}</b><p>${esc(a.texto)}</p>
        <div class="sbtn">${a.acao ? `<button type="button" class="ibtn ok" data-alerta="${esc(a.id)}" data-resp="executar">${esc(a.acao.rotulo)}</button>` : ''}
        <button type="button" class="ibtn" data-alerta="${esc(a.id)}" data-resp="ok">Ok, já vi</button></div>
      </div>`).join('');
    // alerta novo: vibra e, com o app em segundo plano, notificação do sistema
    const ids = new Set(lista.map((a) => a.id));
    if (vistos) {
      for (const a of lista) {
        if (vistos.has(a.id)) continue;
        navigator.vibrate?.(a.nivel === 'critico' ? [300, 120, 300, 120, 300] : [200, 100, 200]);
        toast(a.titulo, a.nivel === 'critico' ? 'err' : '');
        notificar(a);
      }
    }
    vistos = ids;
  }

  // ---------- avisos no celular ----------
  function renderPermissao() {
    const b = $('#avisosBtn');
    if (!('Notification' in window)) { b.hidden = true; $('#avisosTxt').textContent = 'Este navegador não mostra notificações; os alertas aparecem no topo da aba Casa.'; return; }
    const p = Notification.permission;
    b.hidden = p !== 'default';
    $('#avisosTxt').textContent = p === 'granted' ? 'Avisos ligados: com o painel em segundo plano, cada alerta vira uma notificação do celular.'
      : p === 'denied' ? 'Notificações bloqueadas nas configurações do navegador; os alertas aparecem no topo da aba Casa.'
      : 'Permita notificações para receber os alertas com o painel em segundo plano (no iPhone, só com o app instalado na tela inicial).';
  }
  $('#avisosBtn').addEventListener('click', async () => {
    try { await Notification.requestPermission(); } catch { /* ignorado */ }
    renderPermissao();
  });
  renderPermissao();

  // ---------- insights do dia ----------
  function render(j) {
    $('#inFrases').innerHTML = j.frases.map((f) => `<li>${esc(f)}</li>`).join('');
    $('#inDet').textContent = j.deteccoes;
    $('#inLuz').textContent = dur(j.luzMs);
    $('#inJanela').textContent = `${j.janelaAberta}×`;
    $('#inEnergia').textContent = j.consumo ? `${j.consumo.kWh.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kWh` : '--';
    const max = Math.max(1, ...j.porHora);
    $('#inHoras').innerHTML = j.porHora.map((n, h) => `<i style="height:${Math.max(4, (100 * n) / max)}%" class="${n ? 'n' : ''}" title="${h}h: ${n}"></i>`).join('');
    $('#inNota').textContent = j.media.dias
      ? `Comparado com a média dos ${j.media.dias} dias anteriores${j.emAndamento ? ' (proporcional às horas que já passaram)' : ''}.`
      : 'Ainda sem dias anteriores para comparar.';
  }
  async function carregar() {
    try {
      const r = await fetch(`/api/insights?dia=${dia}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      render(j);
      $('#inErro').hidden = true;
    } catch (e) {
      $('#inErro').hidden = false;
      $('#inErro').textContent = `Resumo indisponível agora (${e.message}).`;
    }
  }
  $('#inDia').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-dia]');
    if (!b) return;
    dia = b.dataset.dia;
    document.querySelectorAll('#inDia button').forEach((x) => x.classList.toggle('on', x === b));
    carregar();
  });
  setInterval(() => aberto && dia === 'hoje' && carregar(), 60000);

  return {
    abrir() { aberto = true; carregar(); renderPermissao(); },
    fechar() { aberto = false; },
    alertas,
  };
}
