// Aba Rotina do painel (I5): sugestões do IoB, modo ausente, rotina aprendida e automações aceitas.
// I6: conforto adaptativo da janela (limites aprendidos dos ajustes manuais, server/conforto.js).
// O aprendizado é feito no servidor (server/rotina.js); as sugestões também chegam pelo stream (state.iob)
// e aparecem como faixa na aba Casa.
const $ = (s) => document.querySelector(s);
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const COMODOS = [['sala', 'Sala'], ['cozinha', 'Cozinha'], ['quarto', 'Quarto'], ['externa', 'Externa']];
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(url, opts) {
  const r = await fetch(url, { cache: 'no-store', ...opts, headers: { 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export function criarRotina({ toast }) {
  let aberto = false, dados = null, ausente = { ligado: false }, sugestoesStream = [], conf = null, tempAtual = NaN;

  const cartao = (s, compacto = false) => `
    <div class="card sug ${s.tipo}" data-id="${esc(s.id)}">
      <b>${esc(s.titulo)}</b>
      ${compacto ? '' : `<p>${esc(s.texto)}</p>`}
      <div class="sbtn"><button type="button" class="ibtn ok" data-sug="sim">${s.tipo === 'automacao' ? 'Criar rotina' : 'Sim'}</button>
      <button type="button" class="ibtn" data-sug="nao">Agora não</button></div>
    </div>`;

  async function responder(id, aceitar) {
    navigator.vibrate?.(12);
    try {
      dados = await api('/api/rotina/sugestao', { method: 'POST', body: JSON.stringify({ id, aceitar }) });
      toast(aceitar ? 'Feito — a casa vai lembrar disso' : 'Ok, não pergunto de novo por um tempo');
      if (aberto) render();
    } catch (e) { toast(`Não foi possível: ${e.message}`, 'err'); }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sug]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    responder(id, b.dataset.sug === 'sim');
  });

  async function setAusente(ligado) {
    navigator.vibrate?.(12);
    try {
      dados = await api('/api/ausente', { method: 'POST', body: JSON.stringify({ ligado }) });
      toast(ligado ? 'Modo ausente ligado: as luzes vão simular a casa ocupada' : 'Modo ausente desligado');
      if (aberto) render();
    } catch (e) { toast(`Não foi possível: ${e.message}`, 'err'); }
  }
  $('#dev-ausente').addEventListener('click', () => setAusente(!ausente.ligado));

  $('#rAutomacoes').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-rm]');
    if (!b) return;
    try {
      dados = await api(`/api/rotina/automacao/${encodeURIComponent(b.dataset.rm)}`, { method: 'DELETE' });
      toast('Rotina removida');
      render();
    } catch (err) { toast(`Não foi possível remover: ${err.message}`, 'err'); }
  });

  function renderAusente() {
    const el = $('#dev-ausente');
    el.classList.toggle('on', !!ausente.ligado);
    el.setAttribute('aria-pressed', ausente.ligado ? 'true' : 'false');
    $('#st-dev-ausente').textContent = ausente.ligado
      ? `Ligado desde ${new Date(ausente.desde).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
      : 'Desligado';
    document.body.classList.toggle('ausente', !!ausente.ligado);
  }

  function render() {
    if (!dados) return;
    ausente = dados.ausente;
    renderAusente();
    $('#rSugestoes').innerHTML = dados.sugestoes.length ? dados.sugestoes.map((s) => cartao(s)).join('')
      : '<p class="hint">Nenhuma sugestão agora. A casa continua observando a rotina.</p>';
    const u = dados.uteis, f = dados.fds;
    $('#rResumo').textContent = u.saida || u.chegada
      ? `Dias úteis: sai por volta das ${u.saida || '--'} e chega às ${u.chegada || '--'} (${u.amostras} dias).` + (f.amostras ? ` Fim de semana: sai às ${f.saida || '--'}, chega às ${f.chegada || '--'}.` : ' No fim de semana a casa não costuma ficar vazia.')
      : 'Ainda aprendendo: a rotina aparece depois de alguns dias de histórico.';
    $('#rDias').innerHTML = dados.porDia.map((d) => `
      <div class="rdia${d.dia === new Date().getDay() ? ' hoje' : ''}"><span>${DIAS[d.dia]}</span><b>${d.saida || '—'}</b><b>${d.chegada || '—'}</b></div>`).join('');
    // padrão das luzes: faixa de 24 h por cômodo (o modo ausente acende onde passa do limiar)
    $('#rPadrao').innerHTML = COMODOS.map(([k, n]) => `
      <div class="prow"><span>${n}</span><span class="pbar">${dados.padrao[k].map((x, h) =>
        `<i style="--a:${Math.min(1, x).toFixed(2)}" class="${x >= dados.limiar ? 'liga' : ''}" title="${h}h: ${Math.round(x * 100)}%"></i>`).join('')}</span></div>`).join('')
      + '<div class="prow eixo"><span></span><span class="pbar">' + Array.from({ length: 24 }, (_, h) => `<em>${h % 6 === 0 ? h : ''}</em>`).join('') + '</span></div>';
    $('#rAutomacoes').innerHTML = dados.automacoes.length ? dados.automacoes.map((a) => `
      <div class="card auto"><span>${esc(a.descricao)}</span><button type="button" class="ibtn" data-rm="${esc(a.id)}">Remover</button></div>`).join('')
      : '<p class="hint">Nenhuma rotina criada. Aceite uma sugestão acima para a casa agir sozinha.</p>';
  }

  // ---------- I6: conforto da janela ----------
  const grau = (x) => `${Number(x).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C`;
  function renderConforto() {
    if (!conf) return;
    $('#cfAbrir').textContent = grau(conf.abrir);
    $('#cfFechar').textContent = grau(conf.fechar);
    const dif = (a, b) => (a === b ? 'igual ao firmware' : `firmware: ${grau(b)}`);
    $('#cfAbrirFw').textContent = dif(conf.abrir, conf.firmware.abrir);
    $('#cfFecharFw').textContent = dif(conf.fechar, conf.firmware.fechar);
    // escala de 20 a 35 °C: aprendido (branco), firmware (cinza) e a temperatura agora (âmbar)
    const x = (t) => `${Math.min(100, Math.max(0, ((t - 20) / 15) * 100)).toFixed(1)}%`;
    $('#cfEscala').innerHTML = [[conf.firmware.fechar, 'fw'], [conf.firmware.abrir, 'fw'], [conf.fechar, ''], [conf.abrir, '']]
      .map(([t, c]) => `<i class="${c}" style="left:${x(t)}"></i>`).join('')
      + (Number.isFinite(tempAtual) ? `<i class="t" style="left:${x(tempAtual)}"></i><em style="left:${x(tempAtual)}">agora ${grau(tempAtual)}</em>` : '');
    const el = $('#dev-conforto');
    el.classList.toggle('on', !!conf.aplicar);
    el.setAttribute('aria-pressed', conf.aplicar ? 'true' : 'false');
    $('#st-dev-conforto').textContent = conf.aplicar ? 'Ligado — vale com a casa no manual' : 'Desligado';
    $('#cfTexto').textContent = conf.total
      ? `Aprendido de ${conf.total} ${conf.total === 1 ? 'ajuste manual' : 'ajustes manuais'} (média móvel: cada ajuste novo pesa 35 %). ` +
        'No modo automático a placa segue a regra do firmware; o envio do limite à placa (V17) fica para a atualização do firmware.'
      : 'Ainda sem ajustes manuais: abra ou feche a janela pelo painel quando sentir calor ou frio e a casa aprende o seu limite.';
    const hm = (ts) => new Date(ts).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    $('#cfAjustes').innerHTML = conf.ajustes.map((a) => `
      <li class="ev ${a.acao === 'abriu' ? 'amber' : 'cyan'}"><time>${hm(a.ts)}</time><span class="et">${a.acao === 'abriu' ? 'Abriu' : 'Fechou'} com ${grau(a.temp)}</span><span class="eo">manual</span></li>`).join('');
  }
  $('#dev-conforto').addEventListener('click', async () => {
    if (!conf) return;
    navigator.vibrate?.(12);
    try {
      conf = await api('/api/conforto', { method: 'POST', body: JSON.stringify({ aplicar: !conf.aplicar }) });
      renderConforto();
      toast(conf.aplicar ? `No manual a janela abre com ${grau(conf.abrir)} e fecha com ${grau(conf.fechar)}` : 'Limite aprendido desligado');
    } catch (e) { toast(`Não foi possível: ${e.message}`, 'err'); }
  });

  async function carregar() {
    try {
      [dados, conf] = await Promise.all([api('/api/rotina'), api('/api/conforto')]);
      render();
      renderConforto();
      $('#rotErro').hidden = true;
    } catch (e) {
      $('#rotErro').hidden = false;
      $('#rotErro').textContent = `Rotina indisponível agora (${e.message}).`;
    }
  }
  setInterval(() => aberto && carregar(), 60000);

  return {
    abrir() { aberto = true; carregar(); },
    fechar() { aberto = false; },
    // a cada estado do stream: faixa de sugestão na aba Casa e o modo ausente
    estado(iob, values = {}, confResumo) {
      tempAtual = Number(values.V4);
      if (aberto && conf && confResumo && (confResumo.abrir !== conf.abrir || confResumo.aplicar !== conf.aplicar)) carregar();
      if (!iob) return;
      const mudou = JSON.stringify(iob.sugestoes) !== JSON.stringify(sugestoesStream) || iob.ausente.ligado !== ausente.ligado;
      sugestoesStream = iob.sugestoes;
      ausente = iob.ausente;
      renderAusente();
      // na aba Casa só as sugestões de agora (armar, modo ausente); as de rotina ficam na aba Rotina
      const agora = sugestoesStream.filter((s) => s.tipo !== 'automacao');
      $('#sugCasa').hidden = !agora.length;
      $('#sugCasa').innerHTML = agora.slice(0, 1).map((s) => cartao(s)).join('');
      const n = sugestoesStream.length;
      $('#tabRotinaN').hidden = !n;
      $('#tabRotinaN').textContent = n;
      if (mudou && aberto) carregar();
    },
  };
}
