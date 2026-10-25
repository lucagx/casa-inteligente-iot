import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWorld } from './world.js';
import { createAtmosphere } from './atmosphere.js';
import { createUI } from './ui.js';
import { SENSORES } from './config.js';

// ---------- qualidade ----------
// Três perfis. O "auto" escolhe pela placa de vídeo e ainda rebaixa sozinho se o FPS cair.
//   alta  : AO (GTAO), bloom, MSAA 4×, sombra 4096, luzes externas reais, folhagem cheia
//   média : bloom, MSAA 4×, sombra 2048, resolução 1×, sem AO   (GPU integrada recente)
//   leve  : FXAA, sombra 1024, resolução 0,85×, 30 FPS, sem bloom/AO (GPU integrada antiga, celular)
const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 820;
const TIERS = ['high', 'medium', 'low'];
const store = {
  get() { try { return localStorage.getItem('casa3d.qualidade'); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem('casa3d.qualidade', v) : localStorage.removeItem('casa3d.qualidade'); } catch { /* sem storage */ } },
};
function detectTier() {
  if (coarse) return 'low';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/swiftshader|llvmpipe|software|basic render/.test(name)) return 'low';
    if (/nvidia|geforce|rtx|gtx|quadro|radeon (rx|pro)|arc\(tm\) a|apple m\d/.test(name)) return 'high';
    if (/intel.*hd graphics( [2-5]\d{2,3}\b|\s*\(|$)|gma/.test(name)) return 'low'; // Intel HD 2000–5xxx (até ~2015)
    return 'medium'; // Intel UHD / Iris Xe, Radeon integrada (Vega), desconhecida
  } catch { return 'medium'; }
}
const asked = params.get('q');
const qualityAuto = !TIERS.includes(asked);
let tier = qualityAuto ? (TIERS.includes(store.get()) ? store.get() : detectTier()) : asked;
const buildTier = tier; // o mundo (luzes, folhagem) é montado uma vez com o perfil inicial
const PROFILE = {
  high: { scale: Math.min(devicePixelRatio || 1, 1.75), msaa: 4, gtao: true, bloom: true, fxaa: false, shadow: 4096, cap: 0 },
  medium: { scale: 1, msaa: 4, gtao: false, bloom: true, fxaa: false, shadow: 2048, cap: 0 },
  low: { scale: 0.85, msaa: 0, gtao: false, bloom: false, fxaa: true, shadow: 2048, cap: 30 }, // sombra é estática: mapa maior custa só memória
};

const stage = document.getElementById('stage');
const W = () => stage.clientWidth, H = () => stage.clientHeight;
const loaderText = document.querySelector('#loader p');
const step = (msg) => new Promise((r) => { if (loaderText) loaderText.textContent = msg; requestAnimationFrame(() => setTimeout(r, 0)); });

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.setSize(W(), H());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// sombra sob demanda: só é recalculada quando o sol muda ou algo se move (porta, janela, carro)
renderer.shadowMap.autoUpdate = false;
stage.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.setSize(W(), H());
labels.domElement.className = 'labels';
stage.appendChild(labels.domElement);

// ---------- cena ----------
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(34, W() / H(), 0.1, 1200);
camera.position.set(70, 42, 86);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 5;
controls.maxDistance = 75;
controls.maxPolarAngle = Math.PI * 0.64;
controls.target.set(1, 2.2, 0.5);
controls.autoRotateSpeed = 0.35;

// luz do sol / lua
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 110 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
scene.add(hemi);

// ---------- pós-processamento ----------
const rt = new THREE.WebGLRenderTarget(W(), H(), { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, W(), H());
gtao.blendIntensity = 0.85;
gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: 12 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
// brilhos aditivos (sprites e planos de luz, userData.semAO) não são superfícies: o GTAO só esconde pontos e linhas
// no passe de profundidade/normais, e eles viravam quadrados escuros em volta dos balizadores (three r186)
{
  const esconder = gtao._overrideVisibility.bind(gtao);
  gtao._overrideVisibility = function () {
    esconder();
    this.scene.traverse((o) => {
      if ((o.isSprite || o.userData.semAO) && o.visible) { o.visible = false; this._visibilityCache.push(o); }
    });
  };
}
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.4, 0.55, 0.88);
composer.addPass(bloom);
const output = new OutputPass();
composer.addPass(output);
// Proteção contra pixel "infinito"/NaN no buffer HDR (meia precisão, máx. 65504).
// Um único pixel assim, ao passar pelo bloom, se espalha e apaga a tela inteira — era o que
// acontecia no alarme (luz forte colada na sirene). Aqui ele é limitado antes do bloom e da saída.
// max() antes de min(): no DirectX, max(NaN, 0) = 0 (o teste c != c pode ser removido pelo compilador)
const SAFE = 'vec4 safeTex(sampler2D t, vec2 uv){ vec4 c = texture2D(t, uv); if (c.r != c.r || c.g != c.g || c.b != c.b) c = vec4(0.0, 0.0, 0.0, 1.0); c.rgb = min(max(c.rgb, vec3(0.0)), vec3(64.0)); return c; }\n';
for (const [mat, from] of [[bloom.materialHighPassFilter, 'vec4 texel = texture2D( tDiffuse, vUv );'], [output.material, 'gl_FragColor = texture2D( tDiffuse, vUv );']]) {
  const fs = mat.fragmentShader;
  if (!fs.includes(from)) continue;
  const to = from.replace('texture2D( tDiffuse, vUv )', 'safeTex( tDiffuse, vUv )');
  mat.fragmentShader = fs.replace('void main()', SAFE + 'void main()').replace(from, to);
  mat.needsUpdate = true;
}
const fxaa = new FXAAPass();
composer.addPass(fxaa);
// V8: suavização óptica leve — mistura a imagem com um desfoque 3×3 (60%) para tirar a nitidez exagerada da grama,
// folhagem e texturas fotográficas, sem borrar a geometria (o raio é de 1 pixel)
const suave = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uForca: { value: 0.6 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uForca; varying vec2 vUv;
    void main(){
      vec2 p = 1.0 / vec2(textureSize(tDiffuse, 0));
      vec4 c = texture2D(tDiffuse, vUv);
      vec4 b = c * 0.5
        + (texture2D(tDiffuse, vUv + vec2(p.x, 0.0)) + texture2D(tDiffuse, vUv - vec2(p.x, 0.0)) + texture2D(tDiffuse, vUv + vec2(0.0, p.y)) + texture2D(tDiffuse, vUv - vec2(0.0, p.y))) * 0.0875
        + (texture2D(tDiffuse, vUv + p) + texture2D(tDiffuse, vUv - p) + texture2D(tDiffuse, vUv + vec2(p.x, -p.y)) + texture2D(tDiffuse, vUv - vec2(p.x, -p.y))) * 0.0375;
      gl_FragColor = mix(c, b, uForca);
    }`,
});
composer.addPass(suave);

let prof = PROFILE[tier];
let shadowDirty = 4; // quadros com sombra forçada
function applyTier(t, extraScale = 1) {
  tier = t;
  prof = PROFILE[t];
  const pr = prof.scale * extraScale;
  renderer.setPixelRatio(pr);
  renderer.setSize(W(), H());
  composer.setPixelRatio(pr);
  composer.setSize(W(), H());
  gtao.enabled = prof.gtao;
  if (gtao.enabled) gtao.setSize(W() * pr, H() * pr);
  bloom.enabled = prof.bloom;
  fxaa.enabled = prof.fxaa;
  suave.enabled = !prof.fxaa;
  for (const target of [composer.renderTarget1, composer.renderTarget2]) {
    if (target.samples !== prof.msaa) { target.samples = prof.msaa; target.dispose(); }
  }
  if (sun.shadow.mapSize.x !== prof.shadow) {
    sun.shadow.mapSize.set(prof.shadow, prof.shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  shadowDirty = 2;
  document.body.dataset.quality = t;
}

// ---------- mundo ----------
let world, atmo;
// ---------- câmeras ----------
const VIEWS = {
  geral:   { pos: [31, 17, 36], target: [0.8, 1.6, 1.0], label: 'Visão geral' },
  sala:    { pos: [0.6, 2.7, 12.6], target: [-2.8, 1.3, 1.0], label: 'Sala' },
  entrada: { pos: [4.4, 2.9, 13.6], target: [3.6, 1.4, 3.6], label: 'Entrada' }, // fora da calçada da garagem: o carro não tapa a porta
  janela:  { pos: [12.2, 3.0, 3.4], target: [6.0, 1.9, 0.0], label: 'Janela' },
  garagem: { pos: [17.6, 6.2, 12.6], target: [7.9, 0.8, 4.8], label: 'Garagem' }, // pega sensor e calçada inteira (carro em qualquer distância)
  cobertura: { pos: [10.5, 14.8, 14.5], target: [2.3, 6.9, 0.4], label: 'Cobertura' }, // LDR, sirene e antena no quadro
  corte:   { pos: [30, -4, 20], target: [0, -1.5, 0], label: 'Terreno' },
};
let tween = null;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// em tela vertical (celular) a câmera recua para caber a casa inteira
// a distância de cada vista se adapta à proporção da ÁREA LIVRE (sem painéis), não da tela inteira
function viewPos(v) {
  const f = ui ? ui.freeRect() : { w: W(), h: H() };
  const aspect = f.w / f.h;
  const k = aspect < 1.25 ? Math.min(1.9, Math.pow(1.25 / aspect, 0.62)) : 1;
  const t = new THREE.Vector3(...v.target);
  return new THREE.Vector3(...v.pos).sub(t).multiplyScalar(k).add(t);
}
function flyTo(name, dur = 1.6) {
  const v = VIEWS[name];
  if (!v) return;
  controls.autoRotate = false;
  tween = {
    t: 0, dur,
    p0: camera.position.clone(), p1: viewPos(v),
    t0: controls.target.clone(), t1: new THREE.Vector3(...v.target),
  };
}

// ---------- hotspots 3D ----------
function addHotspot(key, el) {
  const obj = new CSS2DObject(el);
  world.anchors[key].add(obj);
  return obj;
}

// ---------- interação / auto-giro ----------
let idle = 0;
controls.addEventListener('start', () => { idle = 0; controls.autoRotate = false; tween = null; });
controls.addEventListener('change', () => { if (!tween) idle = 0; });

// Enquadramento dinâmico: o centro da cena vai para o centro da área livre da tela.
// Usa um "quadro virtual" maior que a tela (setViewOffset) e mostra só a parte visível,
// deslocada. O campo de visão é corrigido para o zoom não mudar quando o painel abre/fecha.
const BASE_FOV = 34;
const framing = { dx: 0, dy: 0, tx: 0, ty: 0, w: 0, h: 0 };
function applyFraming() {
  const w = W(), h = H();
  const ax = Math.abs(framing.dx), ay = Math.abs(framing.dy);
  const fw = w + 2 * ax, fh = h + 2 * ay;
  camera.setViewOffset(fw, fh, framing.dx < 0 ? 2 * ax : 0, framing.dy < 0 ? 2 * ay : 0, w, h);
  camera.aspect = fw / fh;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * fh / h));
  camera.updateProjectionMatrix();
  framing.w = w; framing.h = h;
}
function updateFraming(dt, instant = false) {
  if (!ui) return;
  const f = ui.freeRect(dt);
  framing.tx = f.x + f.w / 2 - W() / 2;
  framing.ty = f.y + f.h / 2 - H() / 2;
  const k = instant ? 1 : 1 - Math.exp(-7 * dt);
  const ndx = framing.dx + (framing.tx - framing.dx) * k, ndy = framing.dy + (framing.ty - framing.dy) * k;
  if (Math.abs(ndx - framing.dx) > 0.2 || Math.abs(ndy - framing.dy) > 0.2 || framing.w !== W() || framing.h !== H() || instant) {
    framing.dx = ndx; framing.dy = ndy;
    applyFraming();
  }
}
applyFraming();

let extraScale = 1;
addEventListener('resize', () => {
  applyFraming();
  applyTier(tier, extraScale);
  labels.setSize(W(), H());
});

// ---------- FPS: rebaixa a qualidade sozinho no modo automático ----------
const shot = params.has('shot');
const fps = { frames: 0, time: 0, warm: 2.5, value: 0 };
function watchFps(realDt) {
  if (shot) return;
  if (fps.warm > 0) { fps.warm -= realDt; return; }
  fps.frames++; fps.time += realDt;
  if (fps.time < 4) return;
  fps.value = fps.frames / fps.time;
  fps.frames = 0; fps.time = 0;
  ui?.setFps(fps.value);
  if (!qualityAuto || document.hidden) return;
  const min = prof.cap ? prof.cap * 0.75 : 30;
  if (fps.value >= min) return;
  if (tier !== 'low') {
    applyTier(TIERS[TIERS.indexOf(tier) + 1], extraScale);
    store.set(tier);
    ui?.setQuality(tier, true, `FPS baixo (${Math.round(fps.value)}) — qualidade ajustada`);
  } else if (extraScale > 0.7) {
    extraScale = 0.7;
    applyTier('low', extraScale);
    ui?.setQuality(tier, true, `FPS baixo (${Math.round(fps.value)}) — resolução reduzida`);
  }
  fps.warm = 1.5;
}

// ---------- loop ----------
const timer = new THREE.Timer();
timer.connect?.(document);
const clock = { elapsedTime: 0, getDelta() { timer.update(); this.elapsedTime = timer.getElapsed(); return timer.getDelta(); } };
const fixedNight = params.get('night');

// modo captura (?shot): renderiza alguns quadros e para — usado para gerar imagens do relatório
const maxFrames = Number(params.get('frames') || 10);
let frameCount = 0, sinceRender = 0, shadowNight = -1;
let ui = null;
// céu: 'ldr' (sensor da placa), 'relogio' (hora do PC) ou 'manual' (hora escolhida)
let sky = { mode: 'ldr', hour: 12 }, ldrNight = 0, lastSkyHour = -1;
const nightFromHour = (h) => 1 - THREE.MathUtils.smoothstep(h, 5.2, 7.0) * (1 - THREE.MathUtils.smoothstep(h, 17.3, 19.3));
function updateSky() {
  if (sky.mode === 'ldr' || fixedNight !== null) return;
  const d = new Date();
  const h = sky.mode === 'relogio' ? d.getHours() + d.getMinutes() / 60 : sky.hour;
  atmo.setNight(nightFromHour(h));
  atmo.setSunHour(h);
  if (Math.abs(h - lastSkyHour) > 0.05) { lastSkyHour = h; shadowDirty = Math.max(shadowDirty, 1); }
}

function frame() {
  if (shot && frameCount >= maxFrames) { document.body.dataset.done = '1'; return; }
  requestAnimationFrame(frame);
  const realDt = shot ? 0.3 : Math.min(clock.getDelta(), 0.1);
  // perfil leve: limita a 30 FPS (metade do trabalho da GPU, menos calor e travadas)
  sinceRender += realDt;
  if (!shot && prof.cap && sinceRender < 1 / prof.cap - 0.002) return;
  const dt = shot ? realDt : Math.min(sinceRender, 0.05);
  sinceRender = 0;
  if (shot) clock.elapsedTime += 0.3;
  const t = clock.elapsedTime;
  if (shot) frameCount++;

  if (tween) {
    tween.t += dt / tween.dur;
    const k = ease(Math.min(1, tween.t));
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.t0, tween.t1, k);
    if (tween.t >= 1) tween = null;
  } else {
    idle += dt;
    if (idle > 16 && !controls.autoRotate) controls.autoRotate = true;
  }
  updateFraming(dt, shot);
  controls.update(dt);

  if (fixedNight !== null) atmo.setNight(Number(fixedNight));
  updateSky();
  atmo.update(dt, t);
  world.S.night = atmo.night;
  world.update(dt, t);
  ui.tick(dt);

  if (Math.abs(atmo.night - shadowNight) > 0.002 || world.S.moving) shadowDirty = Math.max(shadowDirty, 1);
  if (shadowDirty > 0) { renderer.shadowMap.needsUpdate = true; shadowDirty--; shadowNight = atmo.night; }

  composer.render(dt);
  labels.render(scene, camera);
  watchFps(realDt);
}

// ---------- montagem (em etapas, para a tela de carregamento não congelar) ----------
async function init() {
  applyTier(tier);
  await step('Gerando texturas e modelando a casa…');
  const t0 = performance.now();
  world = buildWorld(scene, { quality: buildTier, sensores: SENSORES, 

   });
  //  onCreditoCarro: mostrarCreditoCarro;
  atmo = createAtmosphere(scene, { sun, hemi, renderer, bloomPass: bloom, hi: buildTier === 'high' });
  if (fixedNight !== null) atmo.setNight(Number(fixedNight));

  ui = createUI({
    quality: tier,
    qualityAuto,
    views: VIEWS,
    onView: flyTo,
    addHotspot,
    onQuality(next) {
      const p = new URLSearchParams(location.search);
      if (next === 'auto') { p.delete('q'); store.set(null); } else p.set('q', next);
      location.search = p.toString();
    },
    onSky(cfg) {
      sky = cfg;
      if (sky.mode === 'ldr') { atmo.setSunHour(null); if (fixedNight === null) atmo.setNight(ldrNight); }
      shadowDirty = Math.max(shadowDirty, 1);
    },
    onState(values, meta, changed) {
      world.setState(values, meta);
      if (changed) world.pulse();
      if (!SENSORES.ldr) return; // sem LDR o céu segue o relógio ou a hora manual
      const pct = Number(values.V10);
      let dayness;
      if (Number.isFinite(pct)) dayness = THREE.MathUtils.smoothstep(pct, 12, 68);
      else dayness = values.V6 === 'ESCURO' ? 0.1 : 0.9;
      ldrNight = 1 - dayness;
      if (fixedNight === null && sky.mode === 'ldr') atmo.setNight(ldrNight);
    },
  });

  updateFraming(0, true);
  const start = params.get('view');
  if (start && VIEWS[start]) {
    const v = VIEWS[start];
    camera.position.copy(viewPos(v)); controls.target.set(...v.target);
  }
  await step('Preparando os shaders da placa de vídeo…');
  // compila todos os materiais antes do primeiro quadro (sem isso a 1ª imagem trava por segundos)
  try { await renderer.compileAsync(scene, camera); } catch { /* navegador sem compilação paralela */ }
  window.__loadMs = performance.now() - t0;
  console.info(`[casa3d] perfil ${tier}${qualityAuto ? ' (auto)' : ''} · peças estáticas ${world.stats.before} → ${world.stats.after} · ${Math.round(window.__loadMs)} ms`);

  frame();
  ui.ready();
  if (!(start && VIEWS[start])) setTimeout(() => flyTo('geral', 3.4), 250);
  window.__casa = { world, atmo, flyTo, camera, controls, renderer, scene, composer, applyTier, get tier() { return tier; }, fps };
}
init();

// V3: crédito do modelo 3D do carro (licenças Creative Commons pedem atribuição) — canto inferior direito
function mostrarCreditoCarro(c) {
  if (!c) return;
  const el = document.createElement('a');
  el.className = 'credito';
  el.href = c.fonte || '#';
  el.target = '_blank';
  el.rel = 'noopener';
  el.textContent = `Carro: ${c.titulo} · ${c.autor} · ${c.licenca}`;
  document.body.appendChild(el);
}
