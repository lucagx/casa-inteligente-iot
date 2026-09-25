// Céu com ciclo dia/entardecer/noite, sol/lua, estrelas, nuvens e vaga-lumes.
import * as THREE from 'three';

const KEYS = {
  day: {
    top: '#2c6cc4', horizon: '#c9dcec', bottom: '#8ea6bd',
    sun: '#fff0d8', sunI: 2.7, sunPos: [18, 27, 15],
    hemiSky: '#cfe4ff', hemiGround: '#6d5d4a', hemiI: 0.7,
    env: 0.65, exposure: 0.92, bloom: 0.22, thr: 3.4,
  },
  dusk: {
    top: '#2a3563', horizon: '#f2a06d', bottom: '#3b3552',
    sun: '#ffa35e', sunI: 1.5, sunPos: [28, 6.5, 6],
    hemiSky: '#9187bd', hemiGround: '#3b2e29', hemiI: 0.42,
    env: 0.34, exposure: 1.0, bloom: 0.5, thr: 1.6,
  },
  night: {
    top: '#02050d', horizon: '#111b33', bottom: '#04070e',
    sun: '#a9c0ff', sunI: 0.85, sunPos: [-14, 25, 12],
    hemiSky: '#2e4274', hemiGround: '#0c0f16', hemiI: 0.32,
    env: 0.17, exposure: 1.25, bloom: 0.75, thr: 1.0,
  },
};

const col = (h) => new THREE.Color(h);
const PAL = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, {
  ...v, top: col(v.top), horizon: col(v.horizon), bottom: col(v.bottom), sun: col(v.sun),
  hemiSky: col(v.hemiSky), hemiGround: col(v.hemiGround), sunPos: new THREE.Vector3(...v.sunPos),
}]));

function mix(a, b, t) {
  return {
    top: a.top.clone().lerp(b.top, t), horizon: a.horizon.clone().lerp(b.horizon, t), bottom: a.bottom.clone().lerp(b.bottom, t),
    sun: a.sun.clone().lerp(b.sun, t), sunI: a.sunI + (b.sunI - a.sunI) * t, sunPos: a.sunPos.clone().lerp(b.sunPos, t),
    hemiSky: a.hemiSky.clone().lerp(b.hemiSky, t), hemiGround: a.hemiGround.clone().lerp(b.hemiGround, t),
    hemiI: a.hemiI + (b.hemiI - a.hemiI) * t, env: a.env + (b.env - a.env) * t,
    exposure: a.exposure + (b.exposure - a.exposure) * t, bloom: a.bloom + (b.bloom - a.bloom) * t, thr: a.thr + (b.thr - a.thr) * t,
  };
}

function softSprite(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(0.4, outer); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createAtmosphere(scene, { sun, hemi, renderer, bloomPass, hi }) {
  // cúpula do céu
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() }, night: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float night; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0. ? mix(horizon, top, pow(clamp(h,0.,1.), 0.5)) : mix(horizon, bottom, pow(clamp(-h,0.,1.), 0.45));
        float s = max(dot(d, normalize(sunDir)), 0.);
        float disk = smoothstep(0.9993, 0.9997, s);
        c += sunColor * (pow(s, 12.) * 0.35 + pow(s, 180.) * 1.2 + disk * mix(6., 2.2, night));
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // estrelas
  const starGeo = new THREE.BufferGeometry();
  const N = 1800, pos = new Float32Array(N * 3), sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = Math.random(), v = Math.random() * 0.92 + 0.08;
    const th = u * Math.PI * 2, ph = Math.acos(v);
    pos[i * 3] = 400 * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = 400 * Math.cos(ph);
    pos[i * 3 + 2] = 400 * Math.sin(ph) * Math.sin(th);
    sz[i] = Math.random();
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // nuvens (sprites suaves)
  const cloudTex = softSprite('rgba(255,255,255,0.95)', 'rgba(255,255,255,0.45)');
  const clouds = new THREE.Group();
  const cloudMats = [];
  const centers = [[-70, 26, -90], [60, 34, -110], [110, 22, 10], [-110, 30, 30], [20, 40, 120], [-40, 18, 95]];
  centers.forEach(([cx, cy, cz], k) => {
    for (let i = 0; i < 7; i++) {
      const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.8, fog: false });
      cloudMats.push(m);
      const s = new THREE.Sprite(m);
      const w = 18 + Math.random() * 20;
      s.scale.set(w, w * 0.55, 1);
      s.position.set(cx + (i - 3) * 7 + Math.random() * 4, cy + Math.random() * 4, cz + Math.random() * 8);
      s.userData.drift = 0.6 + k * 0.1;
      clouds.add(s);
    }
  });
  scene.add(clouds);

  // vaga-lumes
  const flyTex = softSprite('rgba(255,255,210,1)', 'rgba(210,255,120,0.5)');
  const FN = hi ? 90 : 45;
  const flyGeo = new THREE.BufferGeometry();
  const fpos = new Float32Array(FN * 3), fseed = [];
  for (let i = 0; i < FN; i++) {
    let x, z;
    do { x = (Math.random() - 0.5) * 28; z = (Math.random() - 0.5) * 21; } while (x > -7 && x < 9 && z > -4.5 && z < 4.5);
    fseed.push([x, z, 0.3 + Math.random() * 2.2, Math.random() * 10]);
  }
  flyGeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const flyMat = new THREE.PointsMaterial({ map: flyTex, size: 0.32, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff7b0, opacity: 0 });
  const flies = new THREE.Points(flyGeo, flyMat);
  scene.add(flies);

  let night = 0, nightT = 0;
  const fog = new THREE.Fog(0xd6e5f1, 80, 320);
  scene.fog = fog;

  function apply(n) {
    const p = n <= 0.5 ? mix(PAL.day, PAL.dusk, n * 2) : mix(PAL.dusk, PAL.night, (n - 0.5) * 2);
    skyMat.uniforms.top.value.copy(p.top);
    skyMat.uniforms.horizon.value.copy(p.horizon);
    skyMat.uniforms.bottom.value.copy(p.bottom);
    skyMat.uniforms.sunColor.value.copy(p.sun);
    skyMat.uniforms.sunDir.value.copy(p.sunPos).normalize();
    skyMat.uniforms.night.value = n;
    sun.color.copy(p.sun);
    sun.intensity = p.sunI;
    sun.position.copy(p.sunPos).normalize().multiplyScalar(45);
    hemi.color.copy(p.hemiSky);
    hemi.groundColor.copy(p.hemiGround);
    hemi.intensity = p.hemiI;
    scene.environmentIntensity = p.env;
    renderer.toneMappingExposure = p.exposure;
    if (bloomPass) { bloomPass.strength = p.bloom; bloomPass.threshold = p.thr; }
    fog.color.copy(p.horizon);
    starMat.opacity = Math.max(0, (n - 0.55) / 0.45);
    const cloudO = 0.85 - n * 0.7;
    for (const m of cloudMats) { m.opacity = cloudO; m.color.copy(p.horizon).lerp(new THREE.Color(0xffffff), 0.5 - n * 0.4); }
    flyMat.opacity = Math.max(0, (n - 0.6) / 0.4) * 0.95;
  }
  apply(0);

  return {
    setNight(v) { nightT = THREE.MathUtils.clamp(v, 0, 1); },
    get night() { return night; },
    update(dt, t) {
      night += (nightT - night) * (1 - Math.exp(-1.6 * dt));
      apply(night);
      clouds.children.forEach((s) => { s.position.x += dt * s.userData.drift; if (s.position.x > 160) s.position.x -= 320; });
      stars.rotation.y = t * 0.004;
      if (flyMat.opacity > 0.01) {
        for (let i = 0; i < FN; i++) {
          const [x, z, y, ph] = fseed[i];
          fpos[i * 3] = x + Math.sin(t * 0.4 + ph) * 0.8;
          fpos[i * 3 + 1] = y + Math.sin(t * 0.9 + ph * 2) * 0.35;
          fpos[i * 3 + 2] = z + Math.cos(t * 0.35 + ph) * 0.8;
        }
        flyGeo.attributes.position.needsUpdate = true;
        flyMat.size = 0.24 + Math.sin(t * 3) * 0.06;
      }
    },
  };
}
