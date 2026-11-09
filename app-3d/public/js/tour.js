// P3: tour guiado da apresentação, por cima da casa 3D ao vivo.
// Painel de vidro escuro à esquerda (a câmera recentraliza a casa na área livre, à direita), a câmera voa até
// cada componente e um fio colorido liga o pino do capítulo ao ponto do componente na cena.
// Cores por sistema: amarelo = sensor, vermelho = atuador/alarme, azul = nuvem/Blynk, verde = IoB, ciano = casa.
import * as THREE from 'three';

const COR = { sensor: '#ffc27a', atuador: '#ff6b81', nuvem: '#6aa8ff', iob: '#36e39a', casa: '#5ee7ff' };

const CAPITULOS = [
  {
    nome: 'O projeto', cor: COR.casa, vista: 'geral', foco: 'mcu',
    pino: 'NodeMCU ESP8266 · Blynk',
    titulo: 'A protoboard ganhou uma casa',
    texto: 'Cada sensor e cada LED da placa têm um par nesta casa 3D. O que acontece lá aparece aqui — e o que vocês tocam aqui acontece lá.',
    placa: 'Placa ligada, conectada ao Wi-Fi e ao Blynk.',
  },
  {
    nome: 'Como o dado viaja', cor: COR.nuvem, vista: 'geral', extra: 'fluxo',
    pino: 'Wi-Fi · API do Blynk · SSE',
    titulo: 'Do sensor à tela em menos de 1 segundo',
    texto: 'A placa decide sozinha e publica no Blynk. O servidor lê, guarda o histórico e envia para a casa 3D e o celular. Os comandos fazem o caminho de volta.',
    placa: 'Nada a fazer — olhem o selo "ao vivo".',
  },
  {
    nome: 'Temperatura e janela', cor: COR.sensor, vista: 'janela', foco: 'dht',
    pino: 'D2 DHT11 → D7 servo · V4 V5 V7',
    titulo: 'Esquentou, a janela abre',
    texto: 'Abre com 30 °C e só fecha com 27 °C. A folga de 3 °C (histerese) impede o servo de abrir e fechar sem parar.',
    placa: 'Aqueçam o DHT11 com a mão e olhem o servo.',
  },
  {
    nome: 'Presença e luz', cor: COR.atuador, vista: 'entrada', foco: 'pir',
    pino: 'D5 PIR → D1 LED · V11 V0',
    titulo: 'Alguém entrou, a luz acende',
    texto: 'O PIR percebe movimento e o LED D1 acende junto com as luzes da casa. A regra roda na placa — funciona mesmo sem internet.',
    placa: 'Passem a mão na frente do PIR.',
  },
  {
    nome: 'Alarme', cor: COR.atuador, vista: 'cobertura', foco: 'alarme',
    pino: 'D6 botão · V9 → D8 buzzer · V8',
    titulo: 'Armado e com presença, dispara',
    texto: 'Presença sozinha não é invasão. Só quando o usuário armou o alarme (botão ou celular) o movimento vira sirene por 4 s e alerta no celular.',
    placa: 'Armem pelo botão D6 e passem pelo PIR.',
  },
  {
    nome: 'Blynk no meio', cor: COR.nuvem, vista: 'geral', extra: 'blynk',
    pino: 'V0 – V17',
    titulo: 'Cada informação é um pino virtual',
    texto: 'Comandos e telemetria passam por datastreams. A placa só envia quando o valor muda, para caber no plano gratuito. No automático, a placa manda; no manual (V3), vocês mandam.',
    placa: 'Troquem V3 para manual no painel do Blynk.',
  },
  {
    nome: 'A casa aprende', cor: COR.iob, vista: 'geral', extra: 'celular',
    pino: 'histórico · Postgres · painel IoB',
    titulo: 'Dos eventos aos hábitos',
    texto: 'A IoT coleta; a IoB dá sentido. Presença por hora, tempo de luz ligada, conforto da janela aprendido e sugestões que viram automações com um toque.',
    placa: 'Abram a aba IoB no celular.',
    nota: 'Extra: o carro elétrico e o carregador entram no consumo da casa.',
  },
  {
    nome: 'Privacidade', cor: COR.nuvem, vista: 'geral',
    pino: 'LGPD · Lei 13.709/2018',
    titulo: 'Rotina é dado sensível',
    texto: 'O usuário vê o que é guardado e para quê, escolhe por quanto tempo, exporta em JSON ou apaga tudo. Sem câmera, som ou localização.',
    placa: 'Tela Privacidade no celular.',
  },
  {
    nome: 'Agora é com vocês', cor: COR.casa, vista: 'geral',
    pino: 'V3 manual',
    titulo: 'Perguntem — a gente aciona na placa',
    texto: 'Fim do tour. Ao sair (Esc), os controles da casa voltam para a tela.',
    placa: 'Escolham: luz, porta, janela ou alarme — no celular ou na casa 3D.',
  },
];

const FLUXO = [
  ['Percepção', COR.sensor, 'Sensores', 'DHT11 e PIR na protoboard'],
  ['Decisão', COR.atuador, 'ESP8266', 'regras no firmware, sem esperar a nuvem'],
  ['Nuvem', COR.nuvem, 'Blynk', 'datastreams V0–V17, painel e eventos'],
  ['Ponte', COR.nuvem, 'Servidor', 'lê a API, grava no Postgres, envia por SSE'],
  ['Gêmeo · IoB', COR.iob, 'Casa 3D e celular', 'tempo real e histórico'],
];
const VPINOS = [
  ['V0', 'Iluminação', 'comando + estado', COR.atuador],
  ['V1', 'Porta', 'comando + estado', COR.nuvem],
  ['V2', 'Janela', 'comando', COR.sensor],
  ['V3', 'Auto / manual', 'comando + estado', COR.casa],
  ['V4', 'Temperatura', 'telemetria °C', COR.sensor],
  ['V5', 'Umidade', 'telemetria %', COR.sensor],
  ['V7', 'Janela aberta?', 'texto', COR.sensor],
  ['V8', 'Estado do alarme', 'texto', COR.atuador],
  ['V9', 'Armar alarme', 'comando + estado', COR.atuador],
  ['V11', 'Presença', 'telemetria', COR.sensor],
  ['V13', 'Terminal', 'log de eventos', '#93a4b8'],
  ['V17', 'Conforto da janela', 'IoB → placa', COR.iob],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param world   anchors do mundo (pontos dos componentes)
 * @param camera  câmera da cena (já com o enquadramento da área livre)
 * @param flyTo   voa até uma vista de VIEWS
 * @param ui      painel (valores ao vivo; freeRect é avisado por "tour-mudou")
 */
export function createTour({ world, camera, flyTo, ui }) {
  const el = document.getElementById('tour');
  const fio = document.getElementById('tourFio');
  const extra = document.getElementById('tourExtra');
  const $ = (s) => el.querySelector(s);
  let i = 0;
  let aberto = false;
  let dadosEm = 0;

  $('#tourLista').innerHTML = CAPITULOS.map(
    (c, k) => `<li><button type="button" data-cap="${k}" style="--cor:${c.cor}">
      <span class="n">${String(k + 1).padStart(2, '0')}</span><span class="traco"></span><span>${esc(c.nome)}</span></button></li>`,
  ).join('');
  $('#tourLista').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cap]');
    if (b) ir(Number(b.dataset.cap));
  });
  $('#tourAnt').addEventListener('click', () => ir(i - 1));
  $('#tourProx').addEventListener('click', () => (i === CAPITULOS.length - 1 ? ir(0) : ir(i + 1)));
  $('#tourSair').addEventListener('click', () => fechar());

  function render() {
    const c = CAPITULOS[i];
    el.style.setProperty('--cor', c.cor);
    fio.style.setProperty('--cor', c.cor);
    $('#tourConta').textContent = `${String(i + 1).padStart(2, '0')} / ${String(CAPITULOS.length).padStart(2, '0')}`;
    $('#tourPino').textContent = c.pino;
    $('#tourTitulo').textContent = c.titulo;
    $('#tourTexto').textContent = c.texto;
    $('#tourPlaca').textContent = c.placa;
    const nota = $('#tourNota');
    nota.textContent = c.nota || '';
    nota.hidden = !c.nota;
    $('#tourProx').textContent = i === CAPITULOS.length - 1 ? 'Recomeçar →' : 'Próximo →';
    $('#tourAnt').disabled = i === 0;
    el.querySelectorAll('#tourLista button').forEach((b, k) => {
      b.classList.toggle('on', k === i);
      if (k === i) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    extra.innerHTML = conteudoExtra(c.extra);
    extra.hidden = !c.extra;
    fio.classList.toggle('on', Boolean(c.foco && world.anchors[c.foco]));
  }

  function conteudoExtra(tipo) {
    if (tipo === 'fluxo')
      return `<ol class="tx-fluxo">${FLUXO.map(([tag, cor, nome, det]) =>
        `<li style="--cor:${cor}"><span class="tag">${tag}</span><strong>${nome}</strong><span>${det}</span></li>`).join('')}</ol>`;
    if (tipo === 'blynk')
      return `<ul class="tx-vpinos">${VPINOS.map(([v, nome, dir, cor]) =>
        `<li style="--cor:${cor}"><b>${v}</b><span>${nome}</span><small>${dir}</small></li>`).join('')}</ul>`;
    if (tipo === 'celular')
      return `<div class="tx-cel">
        <img src="/apresentacao/img/cel-iob.jpg" alt="Tela IoB do painel no celular" />
        <img src="/apresentacao/img/cel-consumo.jpg" alt="Tela de consumo do painel no celular" /></div>`;
    return '';
  }

  function ir(k) {
    i = Math.max(0, Math.min(CAPITULOS.length - 1, k));
    render();
    flyTo(CAPITULOS[i].vista, 1.4);
  }

  function abrir(k = 0) {
    if (aberto) return ir(k);
    aberto = true;
    document.body.dataset.tour = '1';
    el.hidden = false;
    fio.removeAttribute('hidden'); // SVG não tem a propriedade .hidden (só HTML)
    ir(k);
    $('#tourProx').focus({ preventScroll: true });
    dispatchEvent(new Event('tour-mudou'));
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    delete document.body.dataset.tour;
    el.hidden = true;
    fio.setAttribute('hidden', '');
    extra.hidden = true;
    flyTo('geral', 1.6);
    dispatchEvent(new Event('tour-mudou'));
    document.getElementById('tourBtn')?.focus({ preventScroll: true });
  }

  // teclado: setas, PageUp/PageDown (passadores de slide) e espaço; Esc sai
  addEventListener('keydown', (e) => {
    if (!aberto && (e.key === 't' || e.key === 'T') && !e.target.closest?.('input, textarea, select') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      abrir();
      return;
    }
    if (!aberto || e.ctrlKey || e.metaKey || e.altKey) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
      if (e.key === ' ' && e.target.closest?.('button')) return; // espaço num botão já o aciona
      e.preventDefault();
      i === CAPITULOS.length - 1 ? ir(0) : ir(i + 1);
    } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      ir(i - 1);
    } else if (e.key === 'Escape') {
      fechar();
    }
  });

  // fio: do pino do capítulo até o componente projetado na tela (todo quadro, acompanha a câmera)
  const p = new THREE.Vector3();
  const caminho = fio.querySelectorAll('path');
  const [anel1, anel2, ponto] = fio.querySelectorAll('circle');
  function tick() {
    if (!aberto) return;
    const agora = performance.now();
    if (agora - dadosEm > 500) {
      dadosEm = agora;
      const v = ui.values || {};
      const n = Number(v.V4);
      $('#tourT').textContent = Number.isFinite(n) ? n.toFixed(1).replace('.', ',') : '--';
      $('#tourU').textContent = v.V5 ?? '--';
      $('#tourP').textContent = v.V11 === '1' ? 'detectada' : 'livre';
      $('#tourM').textContent = v.V3 === '1' ? 'auto' : 'manual';
    }
    const c = CAPITULOS[i];
    const a = c.foco && world.anchors[c.foco];
    if (!a) return;
    a.getWorldPosition(p).project(camera);
    const x = ((p.x + 1) / 2) * innerWidth;
    const y = ((1 - p.y) / 2) * innerHeight;
    const visivel = p.z < 1 && x > 0 && x < innerWidth && y > 0 && y < innerHeight;
    fio.classList.toggle('on', visivel);
    if (!visivel) return;
    // reto na linha do pino até a borda do painel (não cruza o título) e depois curva até o componente
    const r = $('#tourPino').getBoundingClientRect();
    const sx = r.right + 12;
    const sy = r.top + r.height / 2;
    const ex = Math.max(sx, el.getBoundingClientRect().right - 24);
    const d = `M ${sx} ${sy} L ${ex} ${sy} C ${ex + 140} ${sy}, ${x - 140} ${y}, ${x - 14} ${y}`;
    caminho.forEach((pa) => pa.setAttribute('d', d));
    for (const ci of [anel1, anel2, ponto]) {
      ci.setAttribute('cx', x);
      ci.setAttribute('cy', y);
    }
  }

  return {
    abrir, fechar, tick,
    get aberto() { return aberto; },
  };
}
