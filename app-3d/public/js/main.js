import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWorld } from './world.js';
import { createAtmosphere } from './atmosphere.js';
import { createUI } from './ui.js';

// ---------- qualidade ----------
const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 820;
const quality = params.get('q') || (coarse ? 'low' : 'high');
const hi = quality === 'high';

const stage = document.getElementById('stage');
const W = () => stage.clientWidth, H = () => stage.clientHeight;
const dpr = Math.min(devicePixelRatio || 1, hi ? 2 : 1.5);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(dpr);
renderer.setSize(W(), H());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.setSize(W(), H());
labels.domElement.className = 'labels';
stage.appendChild(labels.domElement);

// ---------- cena ----------
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

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
sun.shadow.mapSize.set(hi ? 4096 : 2048, hi ? 4096 : 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 110 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
scene.add(hemi);

// ---------- pós-processamento ----------
const rt = new THREE.WebGLRenderTarget(W() * dpr, H() * dpr, { type: THREE.HalfFloatType, samples: hi ? 4 : 2 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(dpr);
composer.setSize(W(), H());
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (hi) {
  gtao = new GTAOPass(scene, camera, W(), H());
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.4, 0.55, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- mundo ----------
const world = buildWorld(scene, { quality });
const atmo = createAtmosphere(scene, { sun, hemi, renderer, bloomPass: bloom, hi });

// ---------- câmeras ----------
const VIEWS = {
  geral:   { pos: [31, 17, 36], target: [0.8, 1.6, 1.0], label: 'Visão geral' },
  sala:    { pos: [0.6, 2.7, 12.6], target: [-2.8, 1.3, 1.0], label: 'Sala' },
  entrada: { pos: [8.4, 2.4, 10.8], target: [3.4, 1.25, 3.8], label: 'Entrada' },
  janela:  { pos: [12.2, 3.0, 3.4], target: [6.0, 1.9, 0.0], label: 'Janela' },
  garagem: { pos: [13.6, 3.0, 8.6], target: [6.9, 0.9, 2.6], label: 'Garagem' },
  cobertura: { pos: [12.5, 12.5, 9.5], target: [3.0, 7.0, -0.6], label: 'Cobertura' },
  corte:   { pos: [30, -4, 20], target: [0, -1.5, 0], label: 'Terreno' },
};
let tween = null;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// em tela vertical (celular) a câmera recua para caber a casa inteira
function viewPos(v) {
  const aspect = W() / H();
  const k = aspect < 1.1 ? Math.min(1.9, Math.pow(1.1 / aspect, 0.62)) : 1;
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

// ---------- UI ----------
const ui = createUI({
  quality,
  views: VIEWS,
  onView: flyTo,
  addHotspot,
  onState(values, meta, changed) {
    world.setState(values, meta);
    if (changed) world.pulse();
    const pct = Number(values.V10);
    let dayness;
    if (Number.isFinite(pct)) dayness = THREE.MathUtils.smoothstep(pct, 12, 68);
    else dayness = values.V6 === 'ESCURO' ? 0.1 : 0.9;
    atmo.setNight(1 - dayness);
  },
});

// ---------- interação / auto-giro ----------
let idle = 0;
controls.addEventListener('start', () => { idle = 0; controls.autoRotate = false; tween = null; });
controls.addEventListener('change', () => { if (!tween) idle = 0; });

function frameForPanel() {
  const w = W(), h = H();
  camera.aspect = w / h;
  if (w > 900) {
    const d = 190;
    camera.setViewOffset(w + 2 * d, h, 2 * d, 0, w, h);
    camera.aspect = (w + 2 * d) / h;
  } else {
    const dy = Math.round(h * 0.07);
    camera.setViewOffset(w, h + 2 * dy, 0, 2 * dy, w, h);
    camera.aspect = w / (h + 2 * dy);
  }
  camera.updateProjectionMatrix();
}
frameForPanel();

addEventListener('resize', () => {
  frameForPanel();
  renderer.setSize(W(), H());
  composer.setSize(W(), H());
  labels.setSize(W(), H());
  if (gtao) gtao.setSize(W(), H());
});

// ---------- loop ----------
const timer = new THREE.Timer();
timer.connect?.(document);
const clock = { elapsedTime: 0, getDelta() { timer.update(); this.elapsedTime = timer.getElapsed(); return timer.getDelta(); } };
const fixedNight = params.get('night');
if (fixedNight !== null) atmo.setNight(Number(fixedNight));

// modo captura (?shot): renderiza alguns quadros e para — usado para gerar imagens do relatório
const shot = params.has('shot');
const maxFrames = Number(params.get('frames') || 10);
let frameCount = 0;

function frame() {
  const dt = shot ? 0.3 : Math.min(clock.getDelta(), 0.05);
  if (shot) clock.elapsedTime += 0.3;
  const t = clock.elapsedTime;
  if (shot && frameCount++ >= maxFrames) { document.body.dataset.done = '1'; return; }

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
  controls.update(dt);

  if (fixedNight !== null) atmo.setNight(Number(fixedNight));
  atmo.update(dt, t);
  world.S.night = atmo.night;
  world.update(dt, t);
  ui.tick(dt);

  composer.render(dt);
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}

// primeira renderização e introdução cinematográfica
requestAnimationFrame(() => {
  frame();
  ui.ready();
  const start = params.get('view');
  if (start && VIEWS[start]) {
    const v = VIEWS[start];
    camera.position.copy(viewPos(v)); controls.target.set(...v.target);
  } else {
    setTimeout(() => flyTo('geral', 3.4), 250);
  }
});

window.__casa = { world, atmo, flyTo, camera, controls };
