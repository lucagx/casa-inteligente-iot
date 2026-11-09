// Visão 3D isométrica da protoboard (montagem atual), isolada da casa 3D.
// Contrato: montarProtoboard(elemento, { destaque, aoSelecionar }) → { destacar(id), destruir() }
// id ∈ dht11 | pir | led-luz | led-porta | servo | buzzer | botao | esp8266 (ou null para limpar).
// Extras (opcionais): desmontar(bool) para a vista explodida e tour(bool) para percorrer as peças.
import * as THREE from "three";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { PECAS, SISTEMAS, IDS, ORDEM, peca } from "./dados.js";
import * as P from "./pecas.js";
import { criarFios, NOTAS, ENCAIXES } from "./fios.js";
import * as R from "./rotulos.js";

export { IDS, ORDEM, PECAS, SISTEMAS };

const grau = THREE.MathUtils.degToRad;
const GIRO_PAISAGEM = grau(210); // vista pelo lado dos trilhos de 5 V: fios atrás, peças na frente
const GIRO_RETRATO = grau(180); // em retrato a placa fica na diagonal e ocupa mais altura
const AMPLITUDE = grau(30); // oscilação ±30° em torno do giro base
const PERIODO = 40; // segundos por ciclo
const COR_ARESTA = new THREE.Color("#05080d");
const LARGURA_COMPACTA = 620; // abaixo disso: rótulos viram pontos e o cartão desce
const LARGURA_MEDIA = 1000; // abaixo disso: rótulo só com o nome
const PASSO_TOUR = 5.5; // segundos por peça no tour
const ESPERA_HOVER = 0.12; // tempo parado sobre uma peça antes de trocar o destaque
const ESPERA_SAIDA = 0.3; // tolerância ao sair de uma peça
const ALTURA_INTRO = 16;

const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

export function montarProtoboard(elemento, opcoes = {}) {
  if (!elemento) throw new Error("montarProtoboard: elemento obrigatório");
  const { destaque = null, aoSelecionar = null, controles = true } = opcoes;

  R.injetarEstilo();
  const estiloOriginal = { position: elemento.style.position, aspectRatio: elemento.style.aspectRatio };
  if (getComputedStyle(elemento).position === "static") elemento.style.position = "relative";
  // contêiner sem altura (ex.: coluna flexível da apresentação): ganha uma proporção, mais alta em tela estreita
  const proporcaoPropria = elemento.clientHeight < 40;
  const proporcao = () => (elemento.clientWidth < 520 ? "4 / 5" : "16 / 11");
  if (proporcaoPropria) elemento.style.aspectRatio = proporcao();

  const raiz = document.createElement("div");
  raiz.className = "pb-raiz";
  elemento.appendChild(raiz);

  // ---------- renderer, câmera, luz ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor("#070b12", 1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Protoboard da casa inteligente em vista isométrica");
  raiz.appendChild(canvas);

  const camadaRotulos = new CSS2DRenderer();
  camadaRotulos.domElement.className = "pb-camada";
  raiz.appendChild(camadaRotulos.domElement);

  const cartao = document.createElement("div");
  cartao.className = "pb-cartao";
  cartao.setAttribute("aria-live", "polite");
  raiz.appendChild(cartao);
  raiz.appendChild(R.criarLegenda());
  const barraTour = document.createElement("div");
  barraTour.className = "pb-barra-tour";
  raiz.appendChild(barraTour);

  const scene = new THREE.Scene();
  // isométrica verdadeira: olhando na direção (−1, −1, −1), elevação de 35,26°
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  camera.position.set(1, 1, 1).multiplyScalar(400);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  scene.add(new THREE.HemisphereLight("#dfeaff", "#0a0f18", 1.5));
  const sol = new THREE.DirectionalLight("#fff6ea", 2.4);
  sol.position.set(30, 80, 45); // do lado da câmera (quem gira é a cena)
  scene.add(sol);

  const cena = new THREE.Group(); // gira
  const conteudo = new THREE.Group(); // centralizado dentro de cena
  cena.add(conteudo);
  scene.add(cena);

  // ---------- montagem ----------
  conteudo.add(P.criarBase(4, 4, 80, 50));
  conteudo.add(P.criarSombra(0, 0, 65, 21.6));
  conteudo.add(P.criarSombra(11, 22, 12, 9));
  conteudo.add(P.criarSombra(39.5, -4, 4.6, 12));
  conteudo.add(P.criarProtoboard());

  const pir = P.criarPIR();
  const servo = P.criarServo();
  const corpos = {
    esp8266: [P.criarESP()],
    dht11: [P.criarDHT11()],
    "led-luz": [P.criarLED(32, "#ffd27a"), P.criarResistor(28, 32, "h")],
    "led-porta": [P.criarLED(24, "#ff5a5a"), P.criarResistor(20, 24, "h")],
    servo: [servo.grupo],
    buzzer: [P.criarBuzzer()],
    botao: [P.criarBotao()],
    pir: [pir.grupo],
  };
  const fiosDe = Object.fromEntries(IDS.map((id) => [id, []]));
  const fiosGerais = [];
  for (const { peca: id, objeto } of criarFios({ pir: pir.pinos, servo: servo.fios })) {
    (id ? fiosDe[id] : fiosGerais).push(objeto);
  }

  // arestas escuras (traço de ilustração) em tudo que não é fio
  const arestaNeutra = new THREE.LineBasicMaterial({ color: COR_ARESTA, transparent: true, opacity: 0.4 });
  const arestaBase = new THREE.LineBasicMaterial({ color: "#5ee7ff", transparent: true, opacity: 0.18 });
  function contornar(raizObj, material, aoMesh) {
    raizObj.traverse((o) => {
      if (!o.isMesh) return;
      aoMesh?.(o);
      if (o.userData.semAresta) return;
      o.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), o.userData.borda ? arestaBase : material));
    });
  }
  conteudo.children.forEach((o) => contornar(o, arestaNeutra));

  // fios que "crescem" na montagem inicial
  const fiosAnimados = [];
  function prepararFio(grupo) {
    const tubos = [];
    grupo.traverse((o) => o.isMesh && o.geometry.type === "TubeGeometry" && tubos.push(o.geometry));
    const f = { grupo, tubos, inicio: 0 };
    fiosAnimados.push(f);
    return f;
  }
  for (const f of fiosGerais) {
    conteudo.add(f);
    contornar(f, arestaNeutra);
    prepararFio(f).inicio = 0.14 * ORDEM.length + 0.9;
  }

  const estado = new Map();
  const alvos = []; // meshes clicáveis
  const eventosRotulo = {
    entrar: (id) => proporHover(id, true),
    sair: (id) => hover === id && proporHover(null),
    clicar: (id) => {
      pararTour();
      selecionar(id);
    },
  };
  const geoMarca = new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2);
  const geoGuia = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);

  ORDEM.forEach((id, ordem) => {
    const dados = peca(id);
    const corSis = SISTEMAS[dados.sistema].cor;
    const cor = new THREE.Color(corSis);
    const aresta = new THREE.LineBasicMaterial({ color: COR_ARESTA, transparent: true, opacity: 0.5 });
    const mats = new Set();
    const caixa = new THREE.Box3();
    for (const o of corpos[id]) caixa.expandByObject(o);
    const centro = caixa.getCenter(new THREE.Vector3());

    // elev: sobe e desce a peça; dentro: desfaz o pivô para as peças ficarem nas coordenadas da montagem
    const pivo = new THREE.Vector3(centro.x, 0, centro.z);
    const elev = new THREE.Group();
    elev.position.copy(pivo);
    const dentro = new THREE.Group();
    dentro.position.copy(pivo).negate();
    elev.add(dentro);
    conteudo.add(elev);
    const levaFios = id === "pir" || id === "servo"; // módulos de fora levam o próprio cabo
    for (const o of corpos[id]) dentro.add(o);
    const fios = [];
    for (const o of fiosDe[id]) {
      (levaFios ? dentro : conteudo).add(o);
      fios.push(prepararFio(o));
    }
    for (const o of [...corpos[id], ...fiosDe[id]]) {
      contornar(o, aresta, (m) => {
        m.userData.peca = id;
        alvos.push(m);
        for (const mt of [].concat(m.material)) mats.add(mt);
      });
    }
    for (const m of mats) {
      m.userData.e0 = m.emissive.clone();
      m.userData.ei0 = m.emissiveIntensity;
    }

    // furos de encaixe: quadrados na cor do sistema + guia até o pino, visíveis com a peça fora
    const matMarca = new THREE.MeshBasicMaterial({ color: corSis, transparent: true, opacity: 0, depthWrite: false });
    const matGuia = new THREE.LineBasicMaterial({ color: corSis, transparent: true, opacity: 0 });
    const marcas = new THREE.Group();
    const guias = [];
    for (const [c, l] of ENCAIXES[id]) {
      const p = P.furo(c, l, 0.03);
      const q = new THREE.Mesh(geoMarca, matMarca);
      q.position.copy(p);
      q.userData.semAresta = true;
      const g = new THREE.Line(geoGuia, matGuia);
      g.position.copy(p);
      marcas.add(q, g);
      guias.push(g);
    }
    marcas.visible = false;
    conteudo.add(marcas);

    const ancora = new THREE.Vector3(centro.x, caixa.max.y + 0.3, centro.z);
    const rotulo = R.criarRotulo(dados, ancora, eventosRotulo);
    rotulo.pontoCompacto = ancora.clone().add(new THREE.Vector3(0, 1.4, 0));
    dentro.add(rotulo.obj, rotulo.linha, rotulo.ponta);

    const baseFio = 0.14 * ordem + 0.75;
    for (const f of fios) f.inicio = baseFio;

    estado.set(id, {
      id, cor, aresta, mats, rotulo, elev, pivo, ancora, marcas, matMarca, matGuia, guias,
      altSel: { esp8266: 4, pir: 3.2, servo: 3.2 }[id] ?? 5,
      altExp: id === "esp8266" ? 3.5 : levaFios ? 4.5 : ordem % 2 ? 8 : 6,
      h: 0,
      anim: null,
    });
  });
  for (const n of NOTAS) conteudo.add(R.criarNota(n.texto, n.p));

  // centraliza o conteúdo na origem (eixo do giro)
  const total = new THREE.Box3().setFromObject(conteudo);
  const centro = total.getCenter(new THREE.Vector3());
  conteudo.position.copy(centro).negate();
  const cantos = [];
  for (const x of [total.min.x, total.max.x])
    for (const y of [total.min.y, total.max.y])
      for (const z of [total.min.z, total.max.z]) cantos.push(new THREE.Vector3(x, y, z));
  const rotulos = [...estado.values()].map((e) => e.rotulo);
  const naCena = (lista, dy = 0) => lista.map((p) => p.clone().sub(centro).add(new THREE.Vector3(0, dy, 0)));
  const PONTOS = {
    normal: naCena([...cantos, ...rotulos.map((r) => r.ponto), ...NOTAS.map((n) => n.p)]),
    compacto: naCena([...cantos, ...rotulos.map((r) => r.pontoCompacto)]),
    normalDesm: naCena(rotulos.map((r) => r.ponto), 10),
    compactoDesm: naCena(rotulos.map((r) => r.pontoCompacto), 10),
  };

  // ---------- estado ----------
  let fixo = null; // peça selecionada (clique, toque, setas, tour ou destacar)
  let hover = null; // peça sob o mouse
  let ativo = undefined; // o que o cartão mostra: hover ?? fixo
  let desmontado = false;
  let sujo = true;
  let largura = 0, altura = 0, compacto = false;
  let giroBase = GIRO_PAISAGEM;
  let fase = 0;
  let mouseDentro = false;
  let ladoCartao = "esquerda";
  const reduzirMov = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduzido = reduzirMov.matches;

  const barra = controles
    ? R.criarControles({
        ant: () => passo(-1),
        prox: () => passo(1),
        desmontar: () => {
          pararTour();
          definirDesmontado(!desmontado);
        },
        tour: () => (tourAtivo ? pararTour() : iniciarTour()),
      })
    : null;
  if (barra) raiz.appendChild(barra.el);

  function atualizarBarra() {
    if (!barra) return;
    const i = ORDEM.indexOf(fixo);
    barra.atualizar({
      indice: i + 1,
      total: ORDEM.length,
      nome: fixo ? peca(fixo).nome : null,
      desmontado,
      tour: tourAtivo,
    });
  }

  function aplicar() {
    raiz.classList.toggle("tem-destaque", !!fixo);
    for (const [id, e] of estado) {
      const sel = id === ativo;
      e.aresta.color.copy(sel ? e.cor : COR_ARESTA);
      e.aresta.opacity = sel ? 0.95 : 0.5;
      for (const m of e.mats) {
        if (m.userData.lente) {
          m.emissiveIntensity = sel ? 1.7 : m.userData.ei0;
        } else {
          m.emissive.copy(sel ? e.cor : m.userData.e0);
          m.emissiveIntensity = sel ? (m.transparent ? 0.04 : 0.12) : m.userData.ei0;
        }
      }
      e.rotulo.botao.classList.toggle("ativo", sel);
      e.rotulo.linhaMat.opacity = sel ? 1 : fixo ? 0.15 : 0.55;
    }
    if (ativo) {
      R.preencherCartao(cartao, peca(ativo));
      // cartão preso num canto, do lado oposto ao da peça: nunca cobre o que está sendo explicado
      const e = estado.get(ativo);
      v.copy(e.ancora);
      cena.updateMatrixWorld();
      conteudo.localToWorld(v).project(camera);
      ladoCartao = v.x < 0 ? "direita" : "esquerda";
      cartao.classList.toggle("direita", ladoCartao === "direita");
      cartao.classList.add("visivel");
    } else {
      cartao.classList.remove("visivel");
    }
    atualizarBarra();
    sujo = true;
  }
  function atualizar() {
    const novo = hover ?? fixo;
    if (novo === ativo) return;
    ativo = novo;
    aplicar();
  }

  // hover com intenção: só troca depois de um instante parado, para não piscar entre peças vizinhas
  let hoverPendente;
  let esperaHover = 0;
  function proporHover(id, imediato = false) {
    if (imediato) {
      hoverPendente = undefined;
      if (id !== hover) {
        hover = id;
        atualizar();
      }
      return;
    }
    if (id === hover) {
      hoverPendente = undefined;
      return;
    }
    if (id !== hoverPendente) {
      hoverPendente = id;
      esperaHover = id ? ESPERA_HOVER : ESPERA_SAIDA;
    }
  }

  // ---------- peças saindo e voltando para a placa ----------
  function alturaDe(e) {
    if (desmontado) return e.altExp + (e.id === fixo ? 2 : 0);
    return e.id === fixo ? e.altSel : 0;
  }
  function animarAlturas(ordem = ORDEM, intervalo = 0, duracao = 0.7) {
    let i = 0;
    for (const id of ordem) {
      const e = estado.get(id);
      const para = alturaDe(e);
      if (e.anim ? e.anim.para === para : e.h === para) continue;
      e.anim = { de: e.h, para, t: 0, dur: reduzido ? 0 : duracao, atraso: reduzido ? 0 : intervalo * i++ };
    }
    sujo = true;
  }
  function definirFixo(id, avisar) {
    if (id === fixo) return;
    fixo = id;
    atualizar();
    aplicar();
    animarAlturas();
    if (avisar && typeof aoSelecionar === "function") aoSelecionar(fixo);
  }
  function selecionar(id) {
    definirFixo(id && id === fixo ? null : id, true);
  }
  function definirDesmontado(v) {
    if (v === desmontado) return;
    desmontado = v;
    raiz.classList.toggle("desmontado", v);
    // desmonta na ordem do circuito e monta de trás para a frente, peça por peça
    animarAlturas(v ? ORDEM : [...ORDEM].reverse(), 0.11, 0.8);
    atualizarBarra();
    ajustar();
  }
  function passo(dir) {
    pararTour();
    const i = ORDEM.indexOf(fixo);
    const n = ORDEM.length;
    const j = i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n;
    definirFixo(ORDEM[j], true);
  }

  // ---------- tour ----------
  let tourAtivo = false;
  let tourT = 0;
  let tourIdx = -1;
  function iniciarTour() {
    tourAtivo = true;
    raiz.classList.add("em-tour");
    tourIdx = -1;
    avancarTour();
  }
  function avancarTour() {
    tourIdx++;
    tourT = 0;
    if (tourIdx >= ORDEM.length) {
      pararTour();
      definirFixo(null, true);
      return;
    }
    definirFixo(ORDEM[tourIdx], true);
    atualizarBarra();
  }
  function pararTour() {
    if (!tourAtivo) return;
    tourAtivo = false;
    raiz.classList.remove("em-tour");
    barraTour.style.width = "0";
    atualizarBarra();
  }

  // ---------- câmera: enquadra a montagem em qualquer ângulo do giro; foco suave na peça selecionada ----------
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const frustum = { alvo: null, atual: null };
  const foco = { m: 0, x: 0, y: 0 };

  function ajustar(imediato = false) {
    if (!largura || !altura) return;
    const inv = camera.matrixWorldInverse;
    const A = reduzido ? 0 : AMPLITUDE;
    const listas = [PONTOS[compacto ? "compacto" : "normal"]];
    if (desmontado) listas.push(PONTOS[compacto ? "compactoDesm" : "normalDesm"]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const ang of [-A, -A / 2, 0, A / 2, A]) {
      q.setFromAxisAngle(P.UP, giroBase + ang);
      for (const lista of listas) {
        for (const p of lista) {
          v.copy(p).applyQuaternion(q).applyMatrix4(inv);
          x0 = Math.min(x0, v.x);
          x1 = Math.max(x1, v.x);
          y0 = Math.min(y0, v.y);
          y1 = Math.max(y1, v.y);
        }
      }
    }
    const mL = compacto ? 10 : 24, mR = mL;
    const mT = compacto ? 40 : 34, mB = compacto ? 48 : 52;
    const s = Math.max((x1 - x0) / Math.max(1, largura - mL - mR), (y1 - y0) / Math.max(1, altura - mT - mB));
    const sobraX = largura - mL - mR - (x1 - x0) / s;
    const sobraY = altura - mT - mB - (y1 - y0) / s;
    const l = x0 - (mL + sobraX / 2) * s;
    const t = y1 + (mT + sobraY / 2) * s;
    frustum.alvo = { l, r: l + largura * s, t, b: t - altura * s };
    if (imediato || !frustum.atual) frustum.atual = { ...frustum.alvo };
    sujo = true;
  }

  function aplicarCamera(dt) {
    const a = frustum.atual, alvo = frustum.alvo;
    if (!a) return false;
    let mexeu = false;
    const k = reduzido ? 1 : Math.min(1, dt * 5);
    for (const lado of ["l", "r", "t", "b"]) {
      const d = alvo[lado] - a[lado];
      if (Math.abs(d) > 1e-4) {
        a[lado] += d * k;
        mexeu = true;
      }
    }
    // foco: aproxima e centraliza a peça selecionada
    const querFoco = fixo ? 1 : 0;
    const km = reduzido ? 1 : Math.min(1, dt * 3.5);
    if (Math.abs(querFoco - foco.m) > 1e-3) {
      foco.m += (querFoco - foco.m) * km;
      mexeu = true;
    } else foco.m = querFoco;
    if (fixo) {
      const e = estado.get(fixo);
      v.copy(e.ancora);
      v.y = (e.ancora.y + 0) * 0.5 + e.h; // meio da peça, já levantada
      conteudo.localToWorld(v).applyMatrix4(camera.matrixWorldInverse);
      if (Math.abs(v.x - foco.x) + Math.abs(v.y - foco.y) > 1e-3) mexeu = true;
      foco.x += (v.x - foco.x) * (reduzido ? 1 : Math.min(1, dt * 5));
      foco.y += (v.y - foco.y) * (reduzido ? 1 : Math.min(1, dt * 5));
    }
    const zoom = 1 + 0.7 * foco.m;
    const cx0 = (a.l + a.r) / 2, cy0 = (a.t + a.b) / 2;
    const hw = (a.r - a.l) / 2 / zoom, hh = (a.t - a.b) / 2 / zoom;
    // no compacto o cartão cobre a parte de baixo: a peça vai para o meio do espaço livre acima dele
    let alvoX = foco.x, alvoY = foco.y;
    const porPx = (2 * hw) / largura;
    if (!compacto) {
      // espaço livre ao lado do cartão; a peça vai para o meio dele
      const cw = (cartao.offsetWidth || 0) + 28;
      const xPeca = ladoCartao === "direita" ? (largura - cw) / 2 : cw + (largura - cw) / 2;
      alvoX = foco.x - (xPeca - largura / 2) * porPx;
    } else {
      const livre = altura - (cartao.offsetHeight || 0) - 60;
      const yPeca = Math.max(40, 40 + (livre - 40) / 2); // px a partir do topo
      alvoX = foco.x;
      alvoY = foco.y - (altura / 2 - yPeca) * ((2 * hh) / altura);
    }
    const cx = cx0 + (alvoX - cx0) * foco.m;
    const cy = cy0 + (alvoY - cy0) * foco.m;
    camera.left = cx - hw;
    camera.right = cx + hw;
    camera.top = cy + hh;
    camera.bottom = cy - hh;
    camera.updateProjectionMatrix();
    return mexeu;
  }

  const ro = new ResizeObserver(() => {
    const w = raiz.clientWidth, h = raiz.clientHeight;
    if (w === largura && h === altura) return;
    if (proporcaoPropria && elemento.style.aspectRatio !== proporcao()) {
      elemento.style.aspectRatio = proporcao(); // muda a altura: o observador chama de novo
      return;
    }
    largura = w;
    altura = h;
    if (!w || !h) return;
    compacto = w < LARGURA_COMPACTA;
    raiz.classList.toggle("pb-compacto", compacto);
    raiz.classList.toggle("pb-medio", !compacto && w < LARGURA_MEDIA);
    for (const r of rotulos) {
      r.obj.position.copy(compacto ? r.pontoCompacto : r.ponto);
      r.obj.center.set(0.5, compacto ? 0.5 : r.abaixo ? 0 : 1);
      r.linha.visible = r.ponta.visible = !compacto;
    }
    giroBase = w / h < 1 ? GIRO_RETRATO : GIRO_PAISAGEM;
    cena.rotation.y = giroBase + (reduzido ? 0 : AMPLITUDE * Math.sin((fase * 2 * Math.PI) / PERIODO));
    renderer.setSize(w, h, false);
    camadaRotulos.setSize(w, h);
    ajustar(true);
  });
  ro.observe(raiz);

  const aoMudarMovimento = () => {
    reduzido = reduzirMov.matches;
    if (reduzido) {
      fase = 0;
      cena.rotation.y = giroBase;
    }
    ajustar(true);
  };
  reduzirMov.addEventListener("change", aoMudarMovimento);

  let visivel = false;
  const io = new IntersectionObserver((ent) => {
    visivel = ent[ent.length - 1].isIntersecting;
    sujo = true;
  });
  io.observe(raiz);
  const aoVisibilidade = () => (sujo = true);
  document.addEventListener("visibilitychange", aoVisibilidade);

  // ---------- ponteiro ----------
  const raio = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pegar(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raio.setFromCamera(ndc, camera);
    const hit = raio.intersectObjects(alvos, false)[0];
    return hit ? hit.object.userData.peca : null;
  }
  let inicio = null;
  const aoMover = (ev) => {
    if (ev.pointerType === "touch") return;
    const id = pegar(ev);
    raiz.classList.toggle("sobre-peca", !!id);
    proporHover(id);
  };
  const aoSairCanvas = () => {
    raiz.classList.remove("sobre-peca");
    proporHover(null);
  };
  // o giro para enquanto o mouse está sobre a montagem: nada se mexe debaixo do cursor
  const aoEntrarRaiz = (ev) => ev.pointerType !== "touch" && (mouseDentro = true);
  const aoSairRaiz = () => (mouseDentro = false);
  const aoBaixar = (ev) => (inicio = { x: ev.clientX, y: ev.clientY });
  const aoSoltar = (ev) => {
    if (!inicio) return;
    const moveu = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y);
    inicio = null;
    if (moveu > 8) return;
    pararTour();
    selecionar(pegar(ev));
  };
  const aoTecla = (ev) => {
    if (ev.key === "ArrowRight") passo(1);
    else if (ev.key === "ArrowLeft") passo(-1);
    else if (ev.key === "Escape") {
      pararTour();
      definirFixo(null, true);
    } else return;
    ev.preventDefault();
  };
  canvas.addEventListener("pointermove", aoMover);
  canvas.addEventListener("pointerleave", aoSairCanvas);
  canvas.addEventListener("pointerdown", aoBaixar);
  canvas.addEventListener("pointerup", aoSoltar);
  raiz.addEventListener("pointerenter", aoEntrarRaiz);
  raiz.addEventListener("pointerleave", aoSairRaiz);
  raiz.addEventListener("keydown", aoTecla);

  // ---------- montagem inicial: peças descem uma a uma e os fios crescem até os furos ----------
  let relogioIntro = -1; // < 0: ainda não começou
  function iniciarIntro() {
    if (reduzido) {
      relogioIntro = Infinity;
      for (const e of estado.values()) e.h = alturaDe(e);
      return;
    }
    relogioIntro = 0;
    ORDEM.forEach((id, i) => {
      const e = estado.get(id);
      e.h = ALTURA_INTRO;
      e.anim = { de: ALTURA_INTRO, para: alturaDe(e), t: 0, dur: 0.75, atraso: 0.14 * i };
    });
    for (const f of fiosAnimados) {
      f.grupo.visible = false;
      for (const g of f.tubos) g.setDrawRange(0, 0);
    }
  }
  function animarFios() {
    let falta = false;
    for (const f of fiosAnimados) {
      const k = limitar((relogioIntro - f.inicio) / 0.45, 0, 1);
      f.grupo.visible = k > 0;
      for (const g of f.tubos) {
        const n = g.index.count;
        g.setDrawRange(0, k >= 1 ? n : Math.floor((n * k) / 3) * 3);
      }
      if (k < 1) falta = true;
    }
    return falta;
  }

  function animarPecas(dt) {
    let algum = false;
    for (const e of estado.values()) {
      const a = e.anim;
      if (a) {
        if (a.atraso > 0) a.atraso -= dt;
        else {
          a.t = a.dur ? Math.min(1, a.t + dt / a.dur) : 1;
          e.h = a.de + (a.para - a.de) * suave(a.t);
          if (a.t >= 1) e.anim = null;
        }
        algum = true;
      }
      e.elev.position.y = e.h;
      // furos de encaixe acendem quando a peça sai; guias vão do furo até a ponta do pino
      const vis = limitar((e.h - 0.4) / 2, 0, 1) * (relogioIntro === Infinity || relogioIntro > 2.5 ? 1 : 0);
      e.marcas.visible = vis > 0.01;
      e.matMarca.opacity = 0.85 * vis;
      e.matGuia.opacity = 0.55 * vis;
      for (const g of e.guias) g.scale.y = Math.max(0.001, e.h - 0.9);
    }
    return algum;
  }

  // ---------- laço ----------
  let raf = 0;
  let ultimo = performance.now();
  function quadro(t) {
    raf = requestAnimationFrame(quadro);
    const dt = Math.min(0.1, Math.max(0, (t - ultimo) / 1000));
    ultimo = t;
    if (!visivel || document.hidden || !largura || !altura) return;
    if (relogioIntro < 0) iniciarIntro();

    if (hoverPendente !== undefined) {
      esperaHover -= dt;
      if (esperaHover <= 0) {
        hover = hoverPendente;
        hoverPendente = undefined;
        atualizar();
      }
    }
    if (tourAtivo) {
      tourT += dt;
      barraTour.style.width = `${(Math.min(1, tourT / PASSO_TOUR) * 100).toFixed(2)}%`;
      if (tourT >= PASSO_TOUR) avancarTour();
    }
    const parado = reduzido || mouseDentro || fixo || desmontado || tourAtivo;
    if (!parado) {
      fase += dt;
      cena.rotation.y = giroBase + AMPLITUDE * Math.sin((fase * 2 * Math.PI) / PERIODO);
      sujo = true;
    }
    if (relogioIntro !== Infinity) {
      relogioIntro += dt;
      if (!animarFios()) relogioIntro = Infinity;
      sujo = true;
    }
    if (animarPecas(dt)) sujo = true;
    cena.updateMatrixWorld();
    if (aplicarCamera(dt)) sujo = true;
    if (!sujo) return;
    sujo = false;
    renderer.render(scene, camera);
    camadaRotulos.render(scene, camera);
  }
  raf = requestAnimationFrame(quadro);

  fixo = destaque && IDS.includes(destaque) ? destaque : null;
  atualizar();
  aplicar();

  // ---------- API ----------
  let destruido = false;
  return {
    destacar(id) {
      if (destruido) return;
      if (id != null && !IDS.includes(id)) {
        console.warn(`[protoboard] id desconhecido: ${id}`);
        return;
      }
      hover = null;
      hoverPendente = undefined;
      definirFixo(id ?? null, false);
    },
    desmontar(v = true) {
      if (!destruido) definirDesmontado(!!v);
    },
    tour(v = true) {
      if (destruido) return;
      if (v) iniciarTour();
      else pararTour();
    },
    destruir() {
      if (destruido) return;
      destruido = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      reduzirMov.removeEventListener("change", aoMudarMovimento);
      document.removeEventListener("visibilitychange", aoVisibilidade);
      canvas.removeEventListener("pointermove", aoMover);
      canvas.removeEventListener("pointerleave", aoSairCanvas);
      canvas.removeEventListener("pointerdown", aoBaixar);
      canvas.removeEventListener("pointerup", aoSoltar);
      raiz.removeEventListener("pointerenter", aoEntrarRaiz);
      raiz.removeEventListener("pointerleave", aoSairRaiz);
      raiz.removeEventListener("keydown", aoTecla);
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) {
          m.map?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      raiz.remove();
      elemento.style.position = estiloOriginal.position;
      elemento.style.aspectRatio = estiloOriginal.aspectRatio;
      R.removerEstilo();
    },
  };
}
