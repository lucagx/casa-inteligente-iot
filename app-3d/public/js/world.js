// Mundo 3D: terreno flutuante, casa moderna, interior, jardim e dispositivos IoT.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { fmt } from './format.js';

// ---------- medidas da casa (metros) ----------
const FL = 0.15;          // piso do térreo
const GH = 3.2;           // pé-direito térreo
const SLAB0 = FL + GH;    // 3.35 base da laje intermediária
const UFL = SLAB0 + 0.35; // 3.70 piso superior
const UH = 3.0;           // pé-direito superior
const ROOF0 = UFL + UH;   // 6.70
const T = 0.25;           // espessura das paredes
// escada: degraus flutuantes na parede norte da sala, sobem para +x até o andar de cima
const ST_N = 18, ST_R = (UFL - FL) / ST_N, ST_G = 0.25;
const ST_X0 = -4.9;                          // pé da escada: ~1 m livre até a parede oeste para chegar nela
const ST_X1 = ST_X0 + (ST_N - 1) * ST_G;     // -0,65: chegada no andar de cima
const ST_Z0 = -3.5 + T / 2, ST_Z1 = ST_Z0 + 0.85; // face interna da parede norte → borda livre
const VOID_X0 = -3.0 + T / 2;                // vão na laje começa na face interna da parede oeste de cima

const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

// quality: 'high' | 'medium' | 'low' (ver main.js → perfis de qualidade)
export function buildWorld(scene, { quality = 'high' } = {}) {
  const hi = quality === 'high';
  // perfis com MSAA usam alpha-to-coverage: borda de folha/grama suave em vez de serrilhada e "cintilante"
  const a2c = quality !== 'low';
  const cutout = (o, test) => Object.assign(o, a2c ? { alphaToCoverage: true, alphaTest: 0.12 } : { alphaTest: test });
  const root = new THREE.Group();
  scene.add(root);

  // ================================================================
  // Materiais
  // ================================================================
  const tex = (fn, rep) => { const t = fn(); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
  const std = (o) => new THREE.MeshStandardMaterial(o);

  const M = {
    plaster: std({ map: tex(TX.plaster, [0.35, 0.35]), roughness: 0.92 }),
    slab: std({ map: tex(TX.plaster, [0.25, 0.25]), color: 0xf4f2ee, roughness: 0.85 }),
    darkPlaster: std({ map: tex(TX.darkPlaster, [0.3, 0.3]), roughness: 0.9 }),
    concrete: std({ map: tex(TX.concrete, [0.25, 0.25]), roughness: 0.88 }),
    woodFloor: std({ map: tex(TX.woodFloor, [0.45, 0.45]), roughness: 0.5 }),
    terraceDeck: std({ map: tex(() => TX.woodFloor('#8d6040'), [0.5, 0.5]), roughness: 0.7 }),
    deck: std({ map: tex(() => TX.woodBoard('#98693f', false, 72), [4, 1]), roughness: 0.72 }),
    cladding: std({ map: tex(() => TX.woodBoard('#a9693a', true, 73), [1, 1]), roughness: 0.62 }),
    walnut: std({ map: tex(() => TX.woodBoard('#5c3a22', true, 74), [1, 1]), roughness: 0.45 }),
    oak: std({ map: tex(() => TX.woodBoard('#c49a6c', false, 75), [1, 1]), roughness: 0.5 }),
    frame: std({ color: 0x1f2328, metalness: 0.75, roughness: 0.35 }),
    steel: std({ color: 0xc3c7cc, metalness: 1, roughness: 0.28 }),
    black: std({ color: 0x141518, roughness: 0.4, metalness: 0.2 }),
    grass: std({ map: TX.grass(), roughness: 0.96 }),
    soil: std({ map: TX.soil(), roughness: 1 }),
    rock: std({ map: TX.rock(), roughness: 0.95 }),
    stone: std({ map: tex(TX.stone, [1, 1]), roughness: 0.82 }),
    tile: std({ map: TX.poolTile(), roughness: 0.25 }),
    fabric: new THREE.MeshPhysicalMaterial({ color: 0xd3cbbd, roughness: 1, sheen: 1, sheenRoughness: 0.8, sheenColor: 0xffffff }),
    fabricGreen: new THREE.MeshPhysicalMaterial({ color: 0x4f6b58, roughness: 1, sheen: 1, sheenRoughness: 0.7, sheenColor: 0xbfd6c5 }),
    fabricRust: new THREE.MeshPhysicalMaterial({ color: 0xb4673f, roughness: 1, sheen: 1, sheenRoughness: 0.7, sheenColor: 0xf0c3a0 }),
    rug: std({ map: TX.rug(), roughness: 1 }),
    quartz: std({ color: 0xf1eee9, roughness: 0.22 }),
    cabinet: std({ color: 0x353b42, roughness: 0.5, metalness: 0.1 }),
    ceramic: std({ color: 0xe8e2d6, roughness: 0.6 }),
    terracotta: std({ color: 0xa65a3a, roughness: 0.85 }),
    bark: std({ color: 0x5a4432, roughness: 0.95 }),
    solar: std({ map: TX.solarPanel(), metalness: 0.5, roughness: 0.22 }),
    whitePlastic: std({ color: 0xf2f2ee, roughness: 0.55 }),
    pcbBlack: std({ color: 0x15171a, roughness: 0.6 }),
    pcbBlue: std({ color: 0x1b4f9c, roughness: 0.55 }),
    pcbGreen: std({ color: 0x1f6b3a, roughness: 0.55 }),
    dhtBlue: std({ color: 0x3d8fe0, roughness: 0.5 }),
    fresnel: std({ color: 0xf4f4f0, roughness: 0.35 }), // sem transmissão: ela obriga a renderizar a cena 2×
    trimpot: std({ color: 0xe8a33a, roughness: 0.5 }),
    gold: std({ color: 0xd9b25a, metalness: 1, roughness: 0.3 }),
    carPaint: new THREE.MeshPhysicalMaterial({ color: 0x2f6aa3, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
    rubber: std({ color: 0x111111, roughness: 0.9 }),
    tinted: new THREE.MeshPhysicalMaterial({ color: 0x18222d, metalness: 0.3, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.6 }),
  };

  // vidro: transmissão física no modo alto (reflexo + interior visível), transparência simples no modo leve
  M.glass = hi
    ? new THREE.MeshPhysicalMaterial({ color: 0xe8f3f8, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.02, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.2 })
    : new THREE.MeshPhysicalMaterial({ color: 0xa9c7d6, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.4 });
  M.railGlass = new THREE.MeshPhysicalMaterial({ color: 0xcfe6ee, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false });

  const waterNormal = TX.waterNormal();
  M.water = new THREE.MeshPhysicalMaterial({
    color: 0x2aa3bd, metalness: 0, roughness: 0.04, normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: true, opacity: 0.78, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false,
  });

  // luzes emissivas controladas pelo estado da "Luz" (V0)
  const warmEmissive = () => std({ color: 0xfff4e2, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.4 });
  // cúpulas opacas (não acendem); só a lâmpada dentro delas brilha
  M.lampShade = std({ color: 0xece6dc, roughness: 0.75, side: THREE.DoubleSide });
  M.lampMetal = std({ color: 0x1d1f22, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide });
  M.bulb = warmEmissive();
  M.ledStrip = warmEmissive();
  M.downlight = warmEmissive();
  M.bollard = warmEmissive();
  M.poolLight = std({ color: 0xbff4ff, emissive: 0x3fd8ff, emissiveIntensity: 0 });
  M.windowGlow = std({ color: 0x000000, emissive: 0xffb866, emissiveIntensity: 0, transparent: true, opacity: 0.0, depthWrite: false });

  // ================================================================
  // Auxiliares
  // ================================================================
  const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  function box(parent, w, h, d, mat, x, y, z, opts = {}) {
    const g = opts.round ? new RoundedBoxGeometry(w, h, d, 3, opts.round) : new THREE.BoxGeometry(w, h, d);
    const m = shadowed(new THREE.Mesh(g, mat), opts.cast !== false, opts.receive !== false);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function cyl(parent, rt, rb, h, mat, x, y, z, seg = 24) {
    const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  // lâmpada (esfera pequena, não projeta sombra)
  function sph(parent, r, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  // espreguiçadeira: base 0,7 × 1,8 m, estofado e encosto erguido na cabeceira (-z local);
  // rotY gira o conjunto em torno do centro (π/2 = cabeceira para -x)
  function lounger(parent, x, y, z, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    box(g, 0.7, 0.3, 1.8, M.oak, 0, 0.15, 0, { round: 0.04 });
    box(g, 0.66, 0.08, 1.2, M.fabric, 0, 0.34, 0.25, { round: 0.03 });
    // ponta baixa do encosto encosta no início do estofado (z = -0,35; topo 0,38 m)
    box(g, 0.66, 0.08, 0.7, M.fabric, 0, 0.65, -0.57, { round: 0.03 }).rotation.x = 0.9;
    parent.add(g);
    return g;
  }
  // parede com aberturas reais (Shape com furos → Extrude)
  function wall(len, h, holes, mat) {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(len, 0); s.lineTo(len, h); s.lineTo(0, h); s.closePath();
    for (const o of holes) {
      const p = new THREE.Path();
      p.moveTo(o.u, o.v); p.lineTo(o.u, o.v + o.h); p.lineTo(o.u + o.w, o.v + o.h); p.lineTo(o.u + o.w, o.v); p.closePath();
      s.holes.push(p);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
    return shadowed(new THREE.Mesh(g, mat));
  }
  // orienta a parede. dir: direção em que a parede "corre" no mundo
  function placeWall(m, dir, a, c, y) {
    // a: início ao longo da direção, c: coordenada da linha central
    if (dir === '+x') { m.rotation.y = 0; m.position.set(a, y, c - T / 2); }
    if (dir === '-z') { m.rotation.y = Math.PI / 2; m.position.set(c - T / 2, y, a); }
    if (dir === '-x') { m.rotation.y = Math.PI; m.position.set(a, y, c + T / 2); }
    if (dir === '+z') { m.rotation.y = -Math.PI / 2; m.position.set(c + T / 2, y, a); }
    root.add(m);
    return m;
  }
  // caixilho de alumínio dentro de um vão (coordenadas locais da parede)
  function frameOpening(wallMesh, o, { fw = 0.06, depth = T + 0.03, sill = true, mullions = 0, glass = true, zc = T / 2 } = {}) {
    const g = new THREE.Group();
    wallMesh.add(g);
    box(g, o.w, fw, depth, M.frame, o.u + o.w / 2, o.v + o.h - fw / 2, zc);
    box(g, o.w, fw, depth, M.frame, o.u + o.w / 2, o.v + fw / 2, zc);
    box(g, fw, o.h, depth, M.frame, o.u + fw / 2, o.v + o.h / 2, zc);
    box(g, fw, o.h, depth, M.frame, o.u + o.w - fw / 2, o.v + o.h / 2, zc);
    for (let i = 1; i <= mullions; i++) {
      box(g, 0.045, o.h - fw * 2, depth * 0.8, M.frame, o.u + (o.w * i) / (mullions + 1), o.v + o.h / 2, zc);
    }
    if (glass) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(o.w - fw * 2, o.h - fw * 2, 0.02), M.glass);
      p.position.set(o.u + o.w / 2, o.v + o.h / 2, zc);
      p.castShadow = false; p.receiveShadow = false;
      g.add(p);
    }
    if (sill) box(g, o.w + 0.16, 0.05, 0.14, M.stone, o.u + o.w / 2, o.v - 0.025, T + 0.06);
    return g;
  }
  // ---------- janelas do servo (V2/V7): todas abrem e fecham juntas ----------
  // casement: dobradiça vertical, abre para fora até 82°; awning: dobradiça em cima, projeta para fora até 38°
  const servoSashes = []; // { hinge, kind }
  function sashGeometry(g, sw, sh, fw, y0) {
    box(g, sw, fw, 0.06, M.frame, sw / 2, y0 + sh - fw / 2, 0);
    box(g, sw, fw, 0.06, M.frame, sw / 2, y0 + fw / 2, 0);
    box(g, fw, sh, 0.06, M.frame, fw / 2, y0 + sh / 2, 0);
    box(g, fw, sh, 0.06, M.frame, sw - fw / 2, y0 + sh / 2, 0);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(sw - fw * 2, sh - fw * 2, 0.018), M.glass);
    pane.position.set(sw / 2, y0 + sh / 2, 0);
    g.add(pane);
  }
  function servoMotor(wallMesh, x, y) {
    // micro servo SG90 azul + braço até o caixilho
    box(wallMesh, 0.12, 0.06, 0.05, M.pcbBlue, x, y, T + 0.03);
    box(wallMesh, 0.02, 0.02, 0.09, M.whitePlastic, x + 0.03, y + 0.03, T + 0.07, { cast: false });
  }
  function servoCasement(wallMesh, o) {
    const hinge = new THREE.Group();
    hinge.userData.dynamic = true;
    hinge.position.set(o.u + 0.06, o.v + o.h / 2, T - 0.03);
    wallMesh.add(hinge);
    const sw = o.w - 0.12, sh = o.h - 0.12;
    sashGeometry(hinge, sw, sh, 0.055, -sh / 2);
    box(hinge, 0.025, 0.16, 0.04, M.steel, sw - 0.09, 0, 0.05); // manopla
    servoMotor(wallMesh, o.u + 0.25, o.v + 0.1);
    servoSashes.push({ hinge, kind: 'casement' });
  }
  function servoAwning(wallMesh, u, v, w, h) {
    const hinge = new THREE.Group();
    hinge.userData.dynamic = true;
    hinge.position.set(u, v + h, T - 0.03);
    wallMesh.add(hinge);
    sashGeometry(hinge, w, h, 0.05, -h);
    box(hinge, 0.3, 0.025, 0.04, M.steel, w / 2, -h + 0.07, 0.05); // puxador
    servoMotor(wallMesh, u + w - 0.2, v + 0.08);
    servoSashes.push({ hinge, kind: 'awning' });
  }
  // cortinas (sem motor no protoboard): acompanham o servo — janelas abertas = cortinas recolhidas.
  // Cada lado é um pivô na ponta do trilho; recolher = encolher em x (as pregas se juntam)
  const curtains = [];
  const curtainMat = std({ color: 0xefe8dc, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  function curtainGeo(w, h) {
    const g = new THREE.PlaneGeometry(w, h, 32, 1), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / w) * Math.PI * 9) * 0.025);
    g.computeVertexNormals();
    return g;
  }
  function curtain(wallMesh, o, over = 0.15) {
    // coordenadas locais da parede: z = 0 é a face interna, -z aponta para dentro da casa
    const cw = o.w + over * 2, ch = o.h + 0.25, top = o.v + o.h + 0.15, z = -0.08;
    box(wallMesh, cw + 0.1, 0.025, 0.025, M.steel, o.u + o.w / 2, top + 0.03, z, { cast: false });
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.userData.dynamic = true;
      pivot.position.set(o.u + o.w / 2 + (side * cw) / 2, top, z);
      wallMesh.add(pivot);
      const m = new THREE.Mesh(curtainGeo(cw / 2, ch), curtainMat);
      m.position.set((-side * cw) / 4, -ch / 2, 0);
      pivot.add(m);
      curtains.push(pivot);
    }
  }
  // porta de correr do terraço: a folha de dentro desliza sobre a fixa junto com as janelas do servo
  function servoSlider(wallMesh, o) {
    const fw = 0.06, u0 = o.u + fw, w = o.w - fw * 2, h = o.h - fw * 2, pw = w / 2 + 0.03;
    const fixed = new THREE.Group();
    fixed.position.set(u0, o.v + fw, T / 2 + 0.035);
    wallMesh.add(fixed);
    sashGeometry(fixed, pw, h, 0.05, 0);
    const slide = new THREE.Group();
    slide.userData.dynamic = true;
    slide.position.set(u0 + w - pw, o.v + fw, T / 2 - 0.035);
    wallMesh.add(slide);
    sashGeometry(slide, pw, h, 0.05, 0);
    box(slide, 0.025, 0.6, 0.03, M.steel, 0.1, h / 2, -0.05); // puxador (lado de dentro)
    servoSashes.push({ hinge: slide, kind: 'slide', x0: slide.position.x, dist: w - pw - 0.04 });
  }

  // folhagem orgânica: icosfera com deslocamento suave pela posição
  function blobGeo(r, detail = 3, amp = 0.18, seed = 1) {
    let g = new THREE.IcosahedronGeometry(r, detail);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.z * 2.7 + seed * 1.3) + Math.sin(v.y * 4.3 + v.x * 1.7 + seed * 2.1) * 0.6;
      v.multiplyScalar(1 + n * amp);
      p.setXYZ(i, v.x, v.y * 0.85, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  // emissivo de cada tipo de luz [dia, noite]. O bloom noturno começa em ~1,25: fitas longas ficam abaixo
  // (brilham sem espalhar); só as lâmpadas pequenas passam um pouco do limite e ganham um halo discreto
  const lightMats = [[M.bulb, 1.0, 2.0], [M.ledStrip, 0.5, 0.9], [M.downlight, 0.5, 0.9], [M.bollard, 0.6, 1.2]];
  // "Poças de luz": círculos aditivos no chão que imitam o facho de um spot sem custo de luz real
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.15)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const lightPools = []; // { mat, base }
  function lightPool(color, x, y, z, rx, rz = rx, base = 0.55) {
    const mat = new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 2;
    root.add(m);
    lightPools.push({ mat, base });
  }
  const pointLights = []; // { light, base }
  // Luzes pontuais custam em TODO pixel de TODO material padrão, mesmo apagadas,
  // por isso são poucas e nenhuma projeta sombra (sombra de luz pontual = 6 renders extras da cena).
  function addPoint(color, intensity, dist, x, y, z) {
    const l = new THREE.PointLight(color, 0, dist, 2);
    l.position.set(x, y, z);
    root.add(l);
    pointLights.push({ light: l, base: intensity });
    return l;
  }

  const anchors = {};
  const anchor = (name, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); root.add(o); anchors[name] = o; return o; };

  // ================================================================
  // Terreno flutuante (maquete em corte)
  // ================================================================
  const LW = 32, LD = 24;
  box(root, LW, 0.4, LD, M.grass, 0, -0.2, 0, { round: 0.18 });
  const soilM = box(root, LW - 0.35, 1.6, LD - 0.35, M.soil, 0, -1.2, 0, { round: 0.12 });
  soilM.material.map.repeat.set(5, 1);
  box(root, LW - 0.9, 2.2, LD - 0.9, M.rock, 0, -3.1, 0, { round: 0.3 });
  box(root, LW - 3.5, 1.2, LD - 3.5, M.rock, 0, -4.6, 0, { round: 0.5 });

  // ================================================================
  // Casa — térreo
  // ================================================================
  box(root, 12.6, FL, 7.6, M.concrete, 0, FL / 2, 0);                 // base
  box(root, 2.3, 0.06, 7.6, M.concrete, 7.45, 0.03, 0);                // piso da garagem
  box(root, 11.75, 0.01, 6.75, M.woodFloor, 0, FL + 0.005, 0, { cast: false }); // piso de madeira

  // Fachada sul: parede sólida com porta e janela lateral estreita
  const doorO = { u: 0.9, v: 0, w: 1.2, h: 2.7 };
  const sideO = { u: 2.3, v: 0.3, w: 0.32, h: 2.2 };
  const southWall = placeWall(wall(4.5, GH, [doorO, sideO], M.plaster), '+x', 1.5, 3.5, FL);
  frameOpening(southWall, sideO, { sill: false });
  // batentes da porta
  const jamb = new THREE.Group(); southWall.add(jamb);
  box(jamb, 0.07, doorO.h, T + 0.05, M.frame, doorO.u + 0.035, doorO.h / 2, T / 2);
  box(jamb, 0.07, doorO.h, T + 0.05, M.frame, doorO.u + doorO.w - 0.035, doorO.h / 2, T / 2);
  box(jamb, doorO.w, 0.07, T + 0.05, M.frame, doorO.u + doorO.w / 2, doorO.h - 0.035, T / 2);
  box(jamb, doorO.w + 0.5, 0.04, 0.9, M.stone, doorO.u + doorO.w / 2, -0.13, T + 0.45); // soleira/degrau
  // fundo do vão fica no mesmo plano do topo da base (y = FL) e piscava: placa de pedra 1,2 cm acima cobre os dois
  box(jamb, doorO.w - 0.14, 0.012, T + 0.05, M.stone, doorO.u + doorO.w / 2, 0.006, T / 2, { cast: false });

  // Folha da porta (pivotada na dobradiça)
  const doorHinge = new THREE.Group();
  doorHinge.userData.dynamic = true;
  doorHinge.position.set(doorO.u + 0.07, 0, T * 0.62);
  southWall.add(doorHinge);
  const leafW = doorO.w - 0.14, leafH = doorO.h - 0.075 - 0.012;
  box(doorHinge, leafW, leafH, 0.06, M.walnut, leafW / 2, 0.012 + leafH / 2, 0);
  // puxador vertical em aço
  box(doorHinge, 0.03, 1.2, 0.03, M.steel, leafW - 0.12, 1.15, 0.09);
  box(doorHinge, 0.03, 0.03, 0.06, M.steel, leafW - 0.12, 0.6, 0.05);
  box(doorHinge, 0.03, 0.03, 0.06, M.steel, leafW - 0.12, 1.7, 0.05);
  // fechadura inteligente com LED
  box(doorHinge, 0.09, 0.2, 0.025, M.black, leafW - 0.12, 1.0, -0.045 + 0.09);
  const lockLedMat = std({ color: 0xff3b55, emissive: 0xff3b55, emissiveIntensity: 2.2 });
  const lockLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 12), lockLedMat);
  lockLed.position.set(leafW - 0.12, 1.07, 0.06);
  doorHinge.add(lockLed);
  // dobradiças
  for (const hy of [0.3, 1.35, 2.35]) cyl(doorHinge, 0.018, 0.018, 0.12, M.steel, 0.0, hy, 0.0, 12);
  const doorWorld = new THREE.Vector3(1.5 + doorO.u + doorO.w / 2, FL + 1.6, 3.8);
  anchor('porta', doorWorld.x, doorWorld.y, doorWorld.z);

  // Fachada sul: pele de vidro da sala (4 painéis)
  const glassWall = new THREE.Group(); root.add(glassWall);
  {
    const x0 = -6.0, x1 = 1.5, z = 3.5, n = 4, pw = (x1 - x0) / n;
    box(glassWall, x1 - x0, 0.08, 0.14, M.frame, (x0 + x1) / 2, FL + 0.04, z);
    box(glassWall, x1 - x0, 0.08, 0.14, M.frame, (x0 + x1) / 2, SLAB0 - 0.04, z);
    for (let i = 0; i <= n; i++) box(glassWall, 0.07, GH, 0.14, M.frame, x0 + i * pw, FL + GH / 2, z);
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.07, GH - 0.16, 0.02), M.glass);
      p.position.set(x0 + pw * (i + 0.5), FL + GH / 2, z);
      glassWall.add(p);
    }
  }

  // Parede leste com a JANELA DO SERVO (abre para fora, dobradiça vertical)
  const servoO = { u: 2.8, v: 1.05, w: 1.4, h: 1.4 };
  const eastWall = placeWall(wall(7, GH, [servoO], M.plaster), '-z', 3.5, 6.0, FL);
  frameOpening(eastWall, servoO, { glass: false, depth: T + 0.03 });
  servoCasement(eastWall, servoO);
  anchor('janela', 6.25, FL + servoO.v + 0.35, 0); // parte baixa da janela: não encosta no rótulo do DHT11

  // Parede norte (cozinha)
  const kitO = { u: 2.0, v: 1.1, w: 2.6, h: 1.1 };
  const nO = { u: 10.5, v: 1.25, w: 1.2, h: 1.5 }; // acima dos primeiros degraus (antes cruzava a escada)
  const northWall = placeWall(wall(12, GH, [kitO, nO], M.plaster), '-x', 6.0, -3.5, FL);
  frameOpening(northWall, kitO, { mullions: 1 });
  frameOpening(northWall, nO, { glass: false });
  servoCasement(northWall, nO);                 // 2ª janela do servo (fundos da sala)

  // Parede oeste
  const wO = { u: 1.0, v: 0.3, w: 2.4, h: 2.5 };
  const westWall = placeWall(wall(7, GH, [wO], M.plaster), '+z', -3.5, -6.0, FL);
  frameOpening(westWall, wO, { mullions: 1 });
  curtain(westWall, wO, 0.05); // sobra curta: o ripado da TV começa logo depois

  // Laje intermediária com beiral
  // laje em 4 partes deixando o vão da escada (VOID_X0..ST_X1 × ST_Z0..ST_Z1)
  {
    const sx0 = -6.35, sx1 = 8.35, sz0 = -3.85, sz1 = 3.85, y = SLAB0 + 0.175;
    const part = (x0, x1, z0, z1) => box(root, x1 - x0, 0.35, z1 - z0, M.slab, (x0 + x1) / 2, y, (z0 + z1) / 2);
    part(sx0, sx1, ST_Z1, sz1);
    part(sx0, VOID_X0, sz0, ST_Z1);
    part(ST_X1, sx1, sz0, ST_Z1);
    part(VOID_X0, ST_X1, sz0, ST_Z0);
  }
  box(root, 14.7, 0.02, 0.02, M.frame, 1.0, SLAB0 + 0.02, 3.86, { cast: false }); // friso de sombra
  // pilares da garagem
  for (const z of [3.55, -3.55]) box(root, 0.18, SLAB0, 0.18, M.frame, 8.15, SLAB0 / 2, z);
  // spots embutidos no beiral
  const downGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20);
  for (const x of [-4.8, -2.6, -0.4, 3.0, 5.0, 7.2]) {
    const d = new THREE.Mesh(downGeo, M.downlight);
    d.position.set(x, SLAB0 - 0.005, 3.72);
    root.add(d);
  }

  // ================================================================
  // Casa — pavimento superior (em balanço sobre a garagem)
  // ================================================================
  box(root, 11.0, 0.01, 2.5 - ST_Z1, M.woodFloor, 2.5, UFL + 0.005, (2.5 + ST_Z1) / 2, { cast: false });
  box(root, 8.0 - ST_X1, 0.01, ST_Z1 + 3.5, M.woodFloor, (8.0 + ST_X1) / 2, UFL + 0.005, (ST_Z1 - 3.5) / 2, { cast: false });
  const ribbonO = { u: 1.0, v: 0.8, w: 6.5, h: 1.5 };
  const ufSouth = placeWall(wall(11, UH, [ribbonO], M.darkPlaster), '+x', -3.0, 2.5, UFL);
  frameOpening(ufSouth, ribbonO, { mullions: 3, glass: false });
  {
    // faixa de vidro do andar de cima: painéis 2 e 4 são basculantes do servo (3ª e 4ª janelas), 1 e 3 fixos
    const pw = ribbonO.w / 4, fw = 0.06, m = 0.0225;
    for (let i = 0; i < 4; i++) {
      const u0 = ribbonO.u + i * pw + (i === 0 ? fw : m), u1 = ribbonO.u + (i + 1) * pw - (i === 3 ? fw : m);
      const v0 = ribbonO.v + fw, v1 = ribbonO.v + ribbonO.h - fw;
      if (i % 2 === 0) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, v1 - v0, 0.02), M.glass);
        p.position.set((u0 + u1) / 2, (v0 + v1) / 2, T / 2);
        ufSouth.add(p);
      } else servoAwning(ufSouth, u0 + 0.01, v0 + 0.01, u1 - u0 - 0.02, v1 - v0 - 0.02);
    }
  }
  const bedO = { u: 1.2, v: 0.4, w: 0.9, h: 2.2 };
  const ufEast = placeWall(wall(6, UH, [bedO], M.darkPlaster), '-z', 2.5, 8.0, UFL);
  frameOpening(ufEast, bedO, { sill: false });
  curtain(ufEast, bedO);
  const ufNO = { u: 3.0, v: 0.9, w: 2.0, h: 1.3 };
  const ufNorth = placeWall(wall(11, UH, [ufNO], M.darkPlaster), '-x', 8.0, -3.5, UFL);
  frameOpening(ufNorth, ufNO);
  curtain(ufNorth, ufNO);
  const slideO = { u: 1.0, v: 0, w: 3.4, h: 2.6 };
  const ufWest = placeWall(wall(6, UH, [slideO], M.darkPlaster), '+z', -3.5, -3.0, UFL);
  frameOpening(ufWest, slideO, { sill: false, glass: false });
  servoSlider(ufWest, slideO); // abre com V7, como as janelas

  // Brises verticais de madeira (profundidade real, projetam sombra)
  {
    const slatGeo = new THREE.BoxGeometry(0.05, UH - 0.1, 0.09);
    const list = [];
    for (let x = 4.95; x <= 7.95; x += 0.11) list.push([x, UFL + UH / 2, 2.5 + T / 2 + 0.06, 0]);
    for (let z = 2.45; z >= -3.45; z -= 0.11) {
      const u = 2.5 - z;
      if (u > bedO.u - 0.02 && u < bedO.u + bedO.w + 0.02) continue;
      list.push([8.0 + T / 2 + 0.06, UFL + UH / 2, z, Math.PI / 2]);
    }
    const inst = shadowed(new THREE.InstancedMesh(slatGeo, M.cladding, list.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach(([x, y, z, ry], i) => {
      q.setFromEuler(e.set(0, ry, 0));
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, m4);
    });
    root.add(inst);
    // travessas de fixação
    for (const y of [UFL + 0.25, ROOF0 - 0.25]) {
      box(root, 3.1, 0.04, 0.03, M.frame, 6.45, y, 2.5 + T / 2 + 0.01);
      box(root, 0.03, 0.04, 6.0, M.frame, 8.0 + T / 2 + 0.01, y, -0.5);
    }
  }

  // Cobertura
  box(root, 11.7, 0.3, 6.7, M.slab, 2.5, ROOF0 + 0.15, -0.5);
  box(root, 11.7, 0.02, 0.02, M.frame, 2.5, ROOF0 + 0.02, 2.86, { cast: false });
  // painéis solares voltados para o norte (hemisfério sul)
  // manta/impermeabilização da laje
  const membrane = std({ map: tex(TX.concrete, [0.35, 0.35]), color: 0xc9c6bf, roughness: 0.95 });
  box(root, 11.3, 0.03, 6.3, membrane, 2.5, ROOF0 + 0.315, -0.5, { cast: false });
  // painéis solares voltados para o norte (hemisfério sul), sobre estrutura de alumínio
  {
    const tilt = 0.2, top = ROOF0 + 0.33, cy = 0.42;
    for (let r = 0; r < 2; r++) {
      const gz = -2.55 + r * 2.0;
      for (let i = 0; i < 6; i++) {
        const g = new THREE.Group();
        g.position.set(-1.8 + i * 1.18, top + cy, gz);
        g.rotation.x = -tilt;
        box(g, 1.08, 0.04, 1.7, M.solar, 0, 0, 0);
        box(g, 1.12, 0.03, 1.74, M.frame, 0, -0.035, 0);
        root.add(g);
      }
      // dois trilhos por fileira, exatamente sob a face inferior dos painéis
      for (const dz of [-0.6, 0.6]) {
        const y = top + cy + dz * Math.sin(tilt) - 0.07;
        box(root, 7.1, 0.05, 0.05, M.steel, 1.15, y, gz + dz * Math.cos(tilt));
        for (const x of [-2.2, -0.2, 1.8, 3.8, 4.5]) {
          const h = y - top;
          box(root, 0.05, h, 0.05, M.steel, x, top + h / 2, gz + dz * Math.cos(tilt));
          box(root, 0.16, 0.02, 0.16, M.frame, x, top + 0.01, gz + dz * Math.cos(tilt));
        }
      }
    }
  }

  // Terraço sobre o térreo (lado oeste) com guarda-corpo de vidro
  box(root, 2.95, 0.03, 7.3, M.terraceDeck, -4.55, UFL + 0.015, 0, { cast: false });
  {
    const railH = 1.05;
    // laterais vão até a face externa da parede oeste do andar de cima e retornam até ela:
    // antes terminavam no ar (a parede só existe entre z = -3,5 e 2,5)
    const xw = -3.0 - T / 2 - 0.01, x0 = -6.25, zs = 3.75, zn = -3.75;
    const rails = [
      { x: x0, z: 0, w: 0.02, d: zs - zn },
      { x: (x0 + xw) / 2, z: zs, w: xw - x0, d: 0.02 },
      { x: (x0 + xw) / 2, z: zn, w: xw - x0, d: 0.02 },
      { x: xw, z: (zs + 2.5) / 2, w: 0.02, d: zs - 2.5 },
      { x: xw, z: (zn - 3.5) / 2, w: 0.02, d: -3.5 - zn },
    ];
    for (const r of rails) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(r.w, railH, r.d), M.railGlass);
      g.position.set(r.x, UFL + railH / 2, r.z);
      root.add(g);
      box(root, Math.max(r.w, 0.05), 0.05, Math.max(r.d, 0.05), M.steel, r.x, UFL + railH, r.z);
    }
    // espreguiçadeiras
    // lado a lado, voltadas para a piscina (+z), longe da porta de correr; encosto sobe na cabeceira
    for (const x of [-5.45, -4.55]) lounger(root, x, UFL, 1.75);
  }

  // ================================================================
  // Interior — térreo
  // ================================================================
  const interior = new THREE.Group(); root.add(interior);
  // Sala
  {
    // sofá em L (seccional): assento principal voltado para a TV + chaise junto ao vidro (z = 3,43),
    // mesmas alturas e almofadas nos dois lados para ler como uma peça só
    const sx = -2.1;              // centro do assento principal (x)
    const z0 = -0.3, zc = 2.1;    // início do assento principal · início da chaise
    const zb = 3.1;               // face de trás do encosto da chaise (33 cm do vidro)
    const xc = -3.5;              // ponta da chaise
    const xb = sx + 0.5;          // face de trás do encosto principal
    box(interior, 1.0, 0.42, zc - z0, M.fabric, sx, FL + 0.21, (z0 + zc) / 2, { round: 0.06 });
    box(interior, xb - xc, 0.42, zb - zc, M.fabric, (xc + xb) / 2, FL + 0.21, (zc + zb) / 2, { round: 0.06 });
    box(interior, 0.28, 0.5, zb - z0, M.fabric, xb - 0.14, FL + 0.62, (z0 + zb) / 2, { round: 0.08 });
    box(interior, xb - 0.28 - xc, 0.5, 0.28, M.fabric, (xc + xb - 0.28) / 2, FL + 0.62, zb - 0.14, { round: 0.08 });
    // braços do chão até 0,68 m (antes ficavam soltos acima do piso, fora do assento)
    box(interior, 1.0, 0.68, 0.22, M.fabric, sx, FL + 0.34, z0 - 0.11, { round: 0.08 });
    box(interior, 0.22, 0.68, zb - zc, M.fabric, xc - 0.11, FL + 0.34, (zc + zb) / 2, { round: 0.08 });
    for (const z of [z0 + 0.4, z0 + 1.2, z0 + 2.0]) box(interior, 0.2, 0.42, 0.75, M.fabric, sx + 0.18, FL + 0.66, z, { round: 0.1 });
    for (const x of [xc + 0.4, xc + 1.2]) box(interior, 0.75, 0.42, 0.2, M.fabric, x, FL + 0.66, zb - 0.38, { round: 0.1 });
    box(interior, 0.14, 0.34, 0.42, M.fabricGreen, sx + 0.05, FL + 0.6, z0 + 0.5, { round: 0.08 }).rotation.z = 0.2;
    box(interior, 0.42, 0.34, 0.14, M.fabricRust, xc + 0.5, FL + 0.6, zb - 0.5, { round: 0.08 }).rotation.x = -0.2;
    // tapete alinhado ao L: começa no braço e entra 40 cm sob a frente da chaise e 60 cm sob o assento
    const rx0 = -5.0, rx1 = sx - 0.5 + 0.6, rz0 = z0, rz1 = zc + 0.4;
    const rx = (rx0 + rx1) / 2, rz = (rz0 + rz1) / 2;
    box(interior, rx1 - rx0, 0.012, rz1 - rz0, M.rug, rx, FL + 0.012, rz, { cast: false });
    // mesa de centro no meio do tapete
    box(interior, 0.7, 0.05, 1.2, M.walnut, rx, FL + 0.38, rz, { round: 0.02 });
    for (const [dx, dz] of [[-0.28, -0.52], [0.28, -0.52], [-0.28, 0.52], [0.28, 0.52]]) box(interior, 0.03, 0.36, 0.03, M.black, rx + dx, FL + 0.18, rz + dz);
    box(interior, 0.25, 0.08, 0.18, M.ceramic, rx + 0.05, FL + 0.44, rz - 0.2, { round: 0.03 });
  }
  // parede de TV com ripado + TV exibindo dados reais
  {
    const ripGeo = new THREE.BoxGeometry(0.04, 2.9, 0.05);
    const n = 26, inst = shadowed(new THREE.InstancedMesh(ripGeo, M.walnut, n)); // começa depois da janela oeste
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m4.makeTranslation(-5.83, FL + 1.5, 0.05 + i * 0.1); inst.setMatrixAt(i, m4); }
    interior.add(inst);
    box(interior, 0.42, 0.42, 2.6, M.cabinet, -5.6, FL + 0.21, 1.15);
  }
  // painel da casa no andar de cima (desenhado em drawRoom) e ventilador do quarto
  const roomCanvas = document.createElement('canvas');
  roomCanvas.width = 1024; roomCanvas.height = 640;
  const roomTex = new THREE.CanvasTexture(roomCanvas);
  roomTex.colorSpace = THREE.SRGBColorSpace;
  roomTex.anisotropy = 8;
  let fan = null;
  const tvCanvas = document.createElement('canvas');
  // desenho em 1024×576 lógicos com escala 2× (2048×1152): texto nítido de perto e mipmaps limpos de longe
  const TV_SCALE = 2;
  tvCanvas.width = 1024 * TV_SCALE; tvCanvas.height = 576 * TV_SCALE;
  const tvTex = new THREE.CanvasTexture(tvCanvas);
  tvTex.colorSpace = THREE.SRGBColorSpace;
  tvTex.anisotropy = 8;
  // tela fosca: reflexo forte do ambiente lavava o contraste do texto
  const tvMat = std({ color: 0x000000, emissive: 0xffffff, emissiveMap: tvTex, emissiveIntensity: 0.9, roughness: 0.6, envMapIntensity: 0.25 });
  box(interior, 0.05, 1.0, 1.72, M.black, -5.74, FL + 1.45, 1.15);
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.94), tvMat);
  tvScreen.position.set(-5.71, FL + 1.45, 1.15);
  tvScreen.rotation.y = Math.PI / 2;
  interior.add(tvScreen);
  anchor('tv', -5.5, FL + 2.15, 1.15);

  // luminária de arco
  {
    cyl(interior, 0.18, 0.2, 0.04, M.black, -1.2, FL + 0.02, 2.6);
    // arco nasce no topo da haste e a cúpula fica presa na ponta dele (antes ficava 0,5 m solta)
    const ax = -2.2, ay = FL + 1.1, R = 1.0, a0 = -0.05, span = Math.PI * 0.7;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.018, 8, 40, span), M.steel);
    arc.position.set(ax, ay, 2.6); arc.rotation.z = a0;
    interior.add(arc);
    const tx = ax + R * Math.cos(a0 + span), ty = ay + R * Math.sin(a0 + span);
    cyl(interior, 0.008, 0.008, 0.08, M.steel, tx, ty - 0.04, 2.6, 6);
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.lampMetal);
    shade.position.set(tx, ty - 0.08 - 0.22, 2.6);
    interior.add(shade);
    sph(interior, 0.05, M.bulb, tx, ty - 0.08 - 0.16, 2.6);
    lightPool(0xffc88a, tx, FL + 0.425, 2.5, 0.5, 0.45, 0.3); // facho no assento da chaise
    cyl(interior, 0.018, 0.018, 1.1, M.steel, -1.2, FL + 0.55, 2.6, 8);
  }
  // planta grande
  function plant(parent, x, z, s = 1, y = FL) {
    cyl(parent, 0.22 * s, 0.17 * s, 0.45 * s, M.ceramic, x, y + 0.225 * s, z);
    const leafMats = [std({ color: 0x3f6b35, roughness: 0.7 }), std({ color: 0x2f5a2c, roughness: 0.7 }), std({ color: 0x5b8a3f, roughness: 0.7 })];
    for (let i = 0; i < 7; i++) {
      const b = shadowed(new THREE.Mesh(blobGeo(0.2 * s, 2, 0.25, i), leafMats[i % 3]));
      const a = (i / 7) * Math.PI * 2;
      b.position.set(x + Math.cos(a) * 0.18 * s, y + (0.8 + (i % 3) * 0.25) * s, z + Math.sin(a) * 0.18 * s);
      parent.add(b);
    }
    cyl(parent, 0.02 * s, 0.03 * s, 0.7 * s, M.bark, x, y + 0.75 * s, z, 8);
  }
  plant(interior, -5.3, 2.9, 1.2);
  plant(interior, 1.1, 2.9, 0.9);

  // Jantar
  {
    box(interior, 0.95, 0.05, 1.9, M.oak, 0.0, FL + 0.75, -1.4, { round: 0.02 });
    for (const [dx, dz] of [[-0.4, -0.85], [0.4, -0.85], [-0.4, 0.85], [0.4, 0.85]]) box(interior, 0.05, 0.73, 0.05, M.black, dx, FL + 0.365, -1.4 + dz);
    for (const [dx, dz, ry] of [[-0.75, -1.9, 0], [-0.75, -0.9, 0], [0.75, -1.9, Math.PI], [0.75, -0.9, Math.PI]]) {
      const ch = new THREE.Group();
      ch.position.set(dx, FL, dz);
      ch.rotation.y = ry;
      box(ch, 0.44, 0.05, 0.44, M.oak, 0, 0.45, 0, { round: 0.02 });
      box(ch, 0.05, 0.45, 0.44, M.oak, -0.2, 0.7, 0, { round: 0.02 });
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) box(ch, 0.03, 0.45, 0.03, M.black, lx, 0.225, lz);
      interior.add(ch);
    }
    // pendente do jantar
    cyl(interior, 0.004, 0.004, 1.1, M.black, 0.0, SLAB0 - 0.55, -1.4, 6);
    const pend = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.32, 0.22, 32, 1, true), M.lampShade);
    pend.position.set(0, SLAB0 - 1.15, -1.4);
    interior.add(pend);
    sph(interior, 0.06, M.bulb, 0, SLAB0 - 1.18, -1.4);
    lightPool(0xffc88a, 0, FL + 0.78, -1.4, 0.5, 0.75, 0.3); // facho no tampo da mesa
  }

  // Cozinha
  {
    box(interior, 3.9, 0.88, 0.62, M.cabinet, 3.7, FL + 0.44, -3.06);
    box(interior, 3.95, 0.04, 0.66, M.quartz, 3.7, FL + 0.9, -3.05);
    box(interior, 1.3, 0.7, 0.36, M.cabinet, 4.95, FL + 1.95, -3.18);
    // ilha
    box(interior, 2.3, 0.88, 0.9, M.cabinet, 3.6, FL + 0.44, -1.0);
    box(interior, 2.4, 0.05, 0.98, M.quartz, 3.6, FL + 0.905, -1.0);
    box(interior, 0.05, 0.9, 0.98, M.quartz, 2.42, FL + 0.45, -1.0);
    box(interior, 0.05, 0.9, 0.98, M.quartz, 4.78, FL + 0.45, -1.0);
    for (const x of [2.9, 3.6, 4.3]) {
      cyl(interior, 0.17, 0.17, 0.05, M.oak, x, FL + 0.72, -0.25);
      cyl(interior, 0.02, 0.02, 0.7, M.black, x, FL + 0.36, -0.25, 8);
      cyl(interior, 0.14, 0.14, 0.02, M.black, x, FL + 0.01, -0.25);
    }
    for (const x of [3.1, 4.1]) {
      cyl(interior, 0.004, 0.004, 1.3, M.black, x, SLAB0 - 0.65, -1.0, 6);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.lampMetal);
      s.position.set(x, SLAB0 - 1.45, -1.0);
      interior.add(s);
      sph(interior, 0.045, M.bulb, x, SLAB0 - 1.41, -1.0);
    }
    box(interior, 0.4, 0.3, 0.3, M.steel, 5.2, FL + 1.07, -3.1, { round: 0.03 }); // cafeteira
    plant(interior, 2.2, -3.1, 0.5, FL + 0.92);
  }

  // Fita de LED no forro (sanca)
  for (const [w, d, x, z] of [[11.6, 0.03, 0, 3.28], [VOID_X0 + 5.8, 0.03, (VOID_X0 - 5.8) / 2, -3.28], [5.8 - ST_X1, 0.03, (5.8 + ST_X1) / 2, -3.28], [0.03, 6.5, -5.78, 0], [0.03, 6.5, 5.78, 0]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), M.ledStrip);
    s.position.set(x, SLAB0 - 0.03, z);
    interior.add(s);
  }

  // Escada: degraus de carvalho presos na parede norte + corrimão de aço no lado livre
  {
    const zc = (ST_Z0 + ST_Z1) / 2, zr = ST_Z1 - 0.04;
    for (let k = 1; k < ST_N; k++) box(interior, ST_G + 0.02, 0.05, ST_Z1 - ST_Z0, M.oak, ST_X0 + (k - 0.5) * ST_G, FL + k * ST_R - 0.025, zc, { round: 0.01 });
    const at = (k) => [ST_X0 + (k - 0.5) * ST_G, FL + k * ST_R];
    for (const k of [1, 6, 11, 16]) { const [x, y] = at(k); cyl(interior, 0.015, 0.015, 0.9, M.steel, x, y + 0.45, zr, 8); }
    const [xa, ya] = at(1), [xb, yb] = at(16), dx = xb - xa, dy = yb - ya;
    const rail = cyl(interior, 0.02, 0.02, Math.hypot(dx, dy), M.steel, (xa + xb) / 2, (ya + yb) / 2 + 0.9, zr, 8);
    rail.rotation.z = -Math.atan2(dx, dy);
    // guarda-corpo de vidro na borda do vão, no andar de cima
    const gw = ST_X1 - VOID_X0;
    const g = new THREE.Mesh(new THREE.BoxGeometry(gw, 1.0, 0.02), M.railGlass);
    g.position.set((VOID_X0 + ST_X1) / 2, UFL + 0.5, ST_Z1 + 0.01);
    interior.add(g);
    box(interior, gw, 0.04, 0.05, M.steel, (VOID_X0 + ST_X1) / 2, UFL + 1.0, ST_Z1 + 0.01);
  }

  // Interior — superior (quarto e escritório)
  {
    // quarto (leste): cama de casal com cabeceira estofada na parede norte, criados, tapete e banco
    const bx = 6.4, bz0 = -3.5 + T / 2, bl = 2.0, bzc = bz0 + bl / 2;
    box(interior, 2.6, 0.012, 2.3, M.rug, bx, UFL + 0.012, -1.75, { cast: false });
    box(interior, 1.9, 1.0, 0.1, M.fabricGreen, bx, UFL + 0.75, bz0 + 0.05, { round: 0.04 });     // cabeceira
    box(interior, 1.72, 0.28, bl - 0.1, M.walnut, bx, UFL + 0.14, bzc + 0.05, { round: 0.03 });    // estrado
    box(interior, 1.62, 0.22, bl - 0.16, M.whitePlastic, bx, UFL + 0.39, bzc + 0.06, { round: 0.06 }); // colchão
    box(interior, 1.66, 0.06, 1.35, M.fabric, bx, UFL + 0.52, bzc + 0.35, { round: 0.03 });         // edredom
    box(interior, 1.66, 0.04, 0.42, M.fabricRust, bx, UFL + 0.56, bzc + 0.72, { round: 0.02 });     // manta nos pés
    for (const dx of [-0.4, 0.4]) box(interior, 0.62, 0.14, 0.36, M.fabric, bx + dx, UFL + 0.57, bz0 + 0.38, { round: 0.06 }).rotation.x = -0.35; // travesseiros
    box(interior, 1.2, 0.42, 0.36, M.oak, bx, UFL + 0.21, bzc + bl / 2 + 0.35, { round: 0.03 });    // banco nos pés
    for (const x of [bx - 1.1, bx + 1.1]) {
      box(interior, 0.45, 0.5, 0.4, M.walnut, x, UFL + 0.25, bz0 + 0.22, { round: 0.02 });
      box(interior, 0.36, 0.012, 0.012, M.steel, x, UFL + 0.32, bz0 + 0.43);                     // puxador da gaveta
      cyl(interior, 0.012, 0.012, 0.2, M.steel, x, UFL + 0.6, bz0 + 0.22, 6);
      const ls = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 24, 1, true), M.lampShade);
      ls.position.set(x, UFL + 0.72, bz0 + 0.22);
      interior.add(ls);
      sph(interior, 0.04, M.bulb, x, UFL + 0.72, bz0 + 0.22);
    }
    // ventilador de teto: gira conforme a temperatura do DHT11 (V4), parado abaixo de 26 °C
    cyl(interior, 0.012, 0.012, 0.32, M.steel, bx, ROOF0 - 0.16, bzc + 0.3, 8);
    fan = new THREE.Group();
    fan.userData.dynamic = true;
    fan.position.set(bx, ROOF0 - 0.38, bzc + 0.3);
    interior.add(fan);
    fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 20), M.black));
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i * Math.PI) / 2;
      fan.add(arm);
      box(arm, 0.6, 0.012, 0.13, M.walnut, 0.4, -0.02, 0, { cast: false, round: 0.005 });
    }

    // armário (centro, parede norte): portas marcadas e puxadores
    box(interior, 2.2, 2.4, 0.6, M.cabinet, 1.8, UFL + 1.2, -3.05);
    for (const x of [1.25, 1.8, 2.35]) box(interior, 0.008, 2.3, 0.01, M.black, x, UFL + 1.2, -2.745, { cast: false });
    for (const x of [1.71, 1.89]) box(interior, 0.02, 0.4, 0.03, M.steel, x, UFL + 1.2, -2.73);

    // escritório (oeste): estante na parede norte, mesa sob a janela em fita, cadeira
    {
      // estante na parede oeste, entre a porta de correr e o canto sul (a parede norte fica livre p/ a chegada da escada)
      const ez = 1.6, ew = 1.2, eh = 1.9, ex = -3.0 + T / 2 + 0.16;
      for (const dz of [-ew / 2, ew / 2]) box(interior, 0.32, eh, 0.03, M.walnut, ex, UFL + eh / 2, ez + dz);
      const shelves = [0.02, 0.48, 0.94, 1.4, eh - 0.015];
      for (const y of shelves) box(interior, 0.32, 0.03, ew, M.walnut, ex, UFL + y, ez);
      const bookMats = [M.fabricGreen, M.fabricRust, M.whitePlastic, M.black, M.oak];
      let n = 0;
      for (let r = 0; r < 4; r++) {
        let z = ez - ew / 2 + 0.06;
        while (z < ez + ew / 2 - 0.12) {
          const w = 0.03 + ((n * 7) % 5) * 0.008, h = 0.24 + ((n * 11) % 7) * 0.025;
          if ((n * 13) % 9 !== 0) box(interior, 0.22, h, w, bookMats[n % bookMats.length], ex + 0.02, UFL + shelves[r] + 0.015 + h / 2, z + w / 2, { cast: false });
          z += w + 0.006; n++;
        }
      }
    }
    {
      const dx = -0.6, dz = 2.5 - T / 2 - 0.35;
      box(interior, 1.4, 0.04, 0.65, M.oak, dx, UFL + 0.74, dz, { round: 0.01 });
      for (const [lx, lz] of [[-0.66, -0.28], [0.66, -0.28], [-0.66, 0.28], [0.66, 0.28]]) box(interior, 0.035, 0.72, 0.035, M.black, dx + lx, UFL + 0.36, dz + lz);
      box(interior, 0.62, 0.37, 0.03, M.black, dx, UFL + 1.08, dz + 0.18);                      // monitor
      box(interior, 0.05, 0.16, 0.05, M.black, dx, UFL + 0.84, dz + 0.2);
      box(interior, 0.42, 0.02, 0.14, M.whitePlastic, dx, UFL + 0.77, dz - 0.12);                // teclado
      // cadeira giratória
      const cz = dz - 0.62;
      cyl(interior, 0.26, 0.26, 0.03, M.black, dx, UFL + 0.03, cz, 20);
      cyl(interior, 0.025, 0.025, 0.42, M.steel, dx, UFL + 0.24, cz, 8);
      box(interior, 0.48, 0.07, 0.46, M.black, dx, UFL + 0.48, cz, { round: 0.03 });
      box(interior, 0.46, 0.52, 0.06, M.black, dx, UFL + 0.82, cz - 0.24, { round: 0.03 });
    }
    plant(interior, 3.5, 1.9, 0.8, UFL);

    // painel da casa na parede norte (entre estante e armário): mesmos dados do painel/TV
    const pm = std({ color: 0x000000, emissive: 0xffffff, emissiveMap: roomTex, emissiveIntensity: 0.9, roughness: 0.6, envMapIntensity: 0.25 });
    box(interior, 0.48, 0.32, 0.02, M.black, 0.25, UFL + 1.45, -3.5 + T / 2 + 0.01);
    const pn = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), pm);
    pn.position.set(0.25, UFL + 1.45, -3.5 + T / 2 + 0.022);
    interior.add(pn);
  }

  // ================================================================
  // Área externa
  // ================================================================
  // deck de madeira (tábuas reais com frestas)
  {
    box(root, 8.4, 0.07, 2.9, M.black, -2.4, 0.035, 5.35, { cast: false });
    const n = 18, geo = new THREE.BoxGeometry(8.4, 0.05, 0.145);
    const inst = shadowed(new THREE.InstancedMesh(geo, M.deck, n));
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-2.4, 0.095, 3.97 + i * 0.16));
      inst.setColorAt(i, c.setHSL(0.07, 0.25, 0.75 + (i * 37 % 10) / 50));
    }
    root.add(inst);
  }
  // deck da sala: conjunto de estar baixo na ponta oeste e vasos nas pontas — o centro fica livre
  // para a vista da sala (nada passa de ~0,8 m de altura)
  {
    const y = 0.12, cz = 5.35;
    box(root, 2.5, 0.01, 2.0, M.rug, -4.9, y + 0.005, cz + 0.25, { cast: false });
    for (const x of [-5.55, -4.25]) {
      box(root, 0.78, 0.26, 0.78, M.oak, x, y + 0.13, cz, { round: 0.03 });                       // base
      box(root, 0.7, 0.12, 0.68, M.fabric, x, y + 0.32, cz + 0.03, { round: 0.04 });              // assento
      box(root, 0.7, 0.36, 0.14, M.fabric, x, y + 0.52, cz - 0.31, { round: 0.05 }).rotation.x = -0.18; // encosto
      for (const dx of [-0.36, 0.36]) box(root, 0.07, 0.2, 0.78, M.oak, x + dx, y + 0.36, cz, { round: 0.02 }); // braços
    }
    cyl(root, 0.32, 0.32, 0.04, M.walnut, -4.9, y + 0.36, cz + 0.85, 28);                        // mesinha
    cyl(root, 0.04, 0.06, 0.34, M.black, -4.9, y + 0.17, cz + 0.85, 10);
    cyl(root, 0.18, 0.18, 0.02, M.black, -4.9, y + 0.01, cz + 0.85, 20);
    plant(root, -6.25, 6.45, 0.7, y);
    plant(root, 1.4, 6.45, 0.7, y);
  }
  // piscina
  {
    const px = -3.6, pz = 8.9, pw = 6.0, pd = 3.0;
    box(root, pw, 0.02, pd, M.tile, px, 0.015, pz, { cast: false });
    box(root, pw, 0.14, 0.05, M.tile, px, 0.07, pz - pd / 2 + 0.025);
    box(root, pw, 0.14, 0.05, M.tile, px, 0.07, pz + pd / 2 - 0.025);
    box(root, 0.05, 0.14, pd, M.tile, px - pw / 2 + 0.025, 0.07, pz);
    box(root, 0.05, 0.14, pd, M.tile, px + pw / 2 - 0.025, 0.07, pz);
    box(root, pw + 0.7, 0.07, 0.35, M.stone, px, 0.16, pz - pd / 2 - 0.175);
    box(root, pw + 0.7, 0.07, 0.35, M.stone, px, 0.16, pz + pd / 2 + 0.175);
    box(root, 0.35, 0.07, pd, M.stone, px - pw / 2 - 0.175, 0.16, pz);
    box(root, 0.35, 0.07, pd, M.stone, px + pw / 2 + 0.175, 0.16, pz);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(px, 0.12, pz);
    water.receiveShadow = true;
    root.add(water);
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.02), M.poolLight);
    pl.position.set(px, 0.07, pz - pd / 2 + 0.06);
    root.add(pl);
    // espreguiçadeiras no gramado a oeste da piscina, pés voltados para a água, 40 cm da borda de pedra
    // (ao sul não cabem: entre a borda e o fim do terreno sobram só 1,25 m)
    const lx = px - pw / 2 - 0.35 - 0.4 - 0.9;
    for (const dz of [-0.55, 0.55]) lounger(root, lx, 0, pz + dz, Math.PI / 2);
  }
  // caminho de pedras até a porta + calçada da garagem
  for (let i = 0; i < 9; i++) box(root, 1.5, 0.06, 0.55, M.stone, 3.0, 0.03, 4.4 + i * 0.85, { round: 0.02 });
  box(root, 2.4, 0.05, 8.0, M.concrete, 7.45, 0.025, 7.75);
  // balizadores (luz de jardim)
  const bollards = [];
  for (const [x, z] of [[1.9, 5.6], [4.1, 5.6], [1.9, 8.2], [4.1, 8.2], [1.9, 10.8], [4.1, 10.8]]) {
    cyl(root, 0.06, 0.07, 0.6, M.frame, x, 0.3, z, 16);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16), M.bollard);
    head.position.set(x, 0.55, z);
    root.add(head);
    bollards.push(head);
  }

  // carro elétrico — entra de frente na garagem; a posição vem do HC-SR04 (V12)
  const car = new THREE.Group();
  car.userData.dynamic = true;
  const carWheels = [];
  const carHeadMat = std({ color: 0xffffff, emissive: 0xdfefff, emissiveIntensity: 0.25 });
  const carTailMat = std({ color: 0x550000, emissive: 0xff2030, emissiveIntensity: 0.8 });
  {
    car.position.set(7.1, 0.05, 7.4);   // afastado do pilar da garagem (x = 8.15)
    car.scale.setScalar(0.88);
    car.rotation.y = Math.PI; // frente (faróis, +z local) virada para o fundo da garagem
    // Carroceria por perfil lateral extrudado (capô, para-brisa, teto, porta-malas e caixas de roda),
    // cabine de vidro separada e rodas de 5 raios. Frente = +z local.
    const W = 1.8, ARCH = 0.45;
    const sideShape = (pts, arches) => {
      const sh = new THREE.Shape();
      sh.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) sh.lineTo(x, y);
      // linha de baixo, de trás para a frente, recortando as caixas de roda (arco por cima da roda)
      for (const cx of [...arches].sort((p, q) => p - q)) {
        sh.lineTo(cx - ARCH, 0.34);
        sh.absarc(cx, 0.34, ARCH, Math.PI, 0, true);
      }
      sh.lineTo(pts[0][0], pts[0][1]);
      return sh;
    };
    const extrudeCar = (shape, width, bevel, mat) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 18 });
      g.rotateY(-Math.PI / 2);                  // comprimento do perfil → eixo z do carro
      g.translate((width - bevel * 2) / 2, 0, 0);
      g.computeVertexNormals();
      const m = shadowed(new THREE.Mesh(g, mat));
      car.add(m);
      return m;
    };
    // corpo (até a linha de cintura)
    extrudeCar(sideShape([[2.2, 0.34], [2.26, 0.6], [2.12, 0.8], [1.6, 0.88], [0.95, 0.98], [-1.55, 0.98], [-2.12, 0.92], [-2.27, 0.66], [-2.22, 0.34]], [1.4, -1.45]), W, 0.08, M.carPaint);
    // cabine (vidros escuros) com para-brisa inclinado e caída do teto em fastback
    {
      const c = new THREE.Shape();
      c.moveTo(0.98, 0.95); c.lineTo(0.18, 1.4); c.lineTo(-0.95, 1.42); c.quadraticCurveTo(-1.55, 1.3, -1.98, 0.95); c.closePath();
      extrudeCar(c, 1.56, 0.07, M.tinted);
      // teto na cor da carroceria + colunas
      const roof = new THREE.Shape();
      roof.moveTo(0.12, 1.4); roof.lineTo(-0.98, 1.425); roof.quadraticCurveTo(-1.3, 1.39, -1.45, 1.3); roof.lineTo(-1.35, 1.36); roof.lineTo(-0.98, 1.455); roof.lineTo(0.14, 1.445); roof.closePath();
      extrudeCar(roof, 1.5, 0.03, M.carPaint);
      for (const sx of [-1, 1]) box(car, 0.03, 0.42, 0.1, M.carPaint, sx * 0.74, 1.17, -0.32, { cast: false }); // coluna B
    }
    // para-choques, saia, placas e retrovisores
    box(car, 1.7, 0.16, 0.12, M.black, 0, 0.42, 2.22, { round: 0.04 });
    box(car, 1.7, 0.16, 0.12, M.black, 0, 0.44, -2.24, { round: 0.04 });
    box(car, 1.5, 0.12, 3.0, M.black, 0, 0.32, 0, { cast: false });
    box(car, 0.46, 0.11, 0.02, M.whitePlastic, 0, 0.6, -2.29, { cast: false });
    box(car, 0.46, 0.11, 0.02, M.whitePlastic, 0, 0.52, 2.28, { cast: false });
    for (const sx of [-1, 1]) {
      box(car, 0.16, 0.08, 0.1, M.carPaint, sx * 0.98, 1.0, 0.82, { round: 0.03 });
      box(car, 0.02, 0.012, 0.2, M.steel, sx * 0.91, 0.85, -0.2, { cast: false }); // maçaneta
    }
    for (const [x, z] of [[-0.8, 1.4], [0.8, 1.4], [-0.8, -1.45], [0.8, -1.45]]) {
      // roda num grupo próprio para girar conforme o carro anda
      const wg = new THREE.Group();
      wg.position.set(x, 0.36, z);
      car.add(wg);
      const w = cyl(wg, 0.36, 0.36, 0.26, M.rubber, 0, 0, 0, 32);
      w.rotation.z = Math.PI / 2;
      const rim = cyl(wg, 0.24, 0.24, 0.27, M.steel, 0, 0, 0, 24);
      rim.rotation.z = Math.PI / 2;
      const hub = cyl(wg, 0.07, 0.07, 0.28, M.frame, 0, 0, 0, 12);
      hub.rotation.z = Math.PI / 2;
      for (let k = 0; k < 5; k++) { // raios escuros: deixam a rotação visível
        const sp = box(wg, 0.28, 0.06, 0.04, M.frame, Math.sign(x) * 0.02, 0, 0, { cast: false });
        sp.rotation.x = (k / 5) * Math.PI;
      }
      carWheels.push(wg);
    }
    // faróis em barra (frente) e lanterna contínua (traseira)
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 0.03), carHeadMat);
    head.position.set(0, 0.79, 2.21); car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.03), carTailMat);
    tail.position.set(0, 0.84, -2.21); car.add(tail);
    root.add(car);
  }

  // folhagem realista: miolo escuro + centenas de cartões de folhas com recorte alfa
  const leafTex = TX.leafCluster(201);
  const leafTex2 = TX.leafCluster(202, [[0.2, 0.5, 0.3], [0.23, 0.55, 0.24], [0.18, 0.45, 0.36], [0.26, 0.5, 0.2]]);
  const leafCardMat = [leafTex, leafTex2].map((map) => new THREE.MeshStandardMaterial(cutout({ map, side: THREE.DoubleSide, roughness: 0.78 }, 0.45)));
  const cardGeo = new THREE.PlaneGeometry(1, 1);
  const innerMat = std({ color: 0x1f3a1a, roughness: 1 });
  const zAxis = new THREE.Vector3(0, 0, 1);
  let leafSeed = 11;
  const lr = () => ((leafSeed = (leafSeed * 16807) % 2147483647) / 2147483647);
  function foliage(parent, blobs, perBlob, cardSize, matIndex = 0) {
    const n = blobs.length * perBlob;
    const inst = shadowed(new THREE.InstancedMesh(cardGeo, leafCardMat[matIndex], n), true, true);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), tw = new THREE.Quaternion(), dir = new THREE.Vector3(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const c = new THREE.Color();
    let k = 0;
    for (const [bx, by, bz, r] of blobs) {
      for (let i = 0; i < perBlob; i++) {
        dir.set(lr() * 2 - 1, lr() * 2 - 1, lr() * 2 - 1).normalize();
        if (dir.y < -0.6) dir.y *= 0.4;
        dir.normalize();
        p.set(bx, by, bz).addScaledVector(dir, r * (0.72 + lr() * 0.36));
        q.setFromUnitVectors(zAxis, dir);
        tw.setFromAxisAngle(dir, lr() * Math.PI * 2);
        q.premultiply(tw);
        const s = cardSize * (0.75 + lr() * 0.55);
        sc.set(s, s, s);
        m4.compose(p, q, sc);
        inst.setMatrixAt(k, m4);
        const sunSide = 0.62 + Math.max(0, dir.y) * 0.28;
        inst.setColorAt(k, c.setRGB(sunSide * (0.88 + lr() * 0.18), sunSide * (0.92 + lr() * 0.14), sunSide * (0.8 + lr() * 0.18)));
        k++;
      }
      const inner = shadowed(new THREE.Mesh(blobGeo(r * 0.78, 2, 0.15, bx * 3 + bz), innerMat), true, false);
      inner.position.set(bx, by, bz);
      parent.add(inner);
    }
    parent.add(inst);
    return inst;
  }

  // árvores
  const trees = [];
  function tree(x, z, s = 1, seed = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const trunk = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.22 * s, 2.6 * s, 10), M.bark));
    trunk.position.y = 1.3 * s;
    g.add(trunk);
    for (const [a, l] of [[0.6, 1.1], [-0.7, 1.0], [2.2, 0.9]]) {
      const br = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.08 * s, l * s, 6), M.bark));
      br.position.set(Math.cos(a) * 0.3 * s, 2.3 * s, Math.sin(a) * 0.3 * s);
      br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
      g.add(br);
    }
    const crown = new THREE.Group();
    crown.userData.dynamic = true;
    crown.position.y = 2.6 * s;
    const blobs = [[0, 0.9, 0, 1.45], [0.9, 0.5, 0.3, 1.05], [-0.8, 0.55, -0.35, 1.1], [0.2, 0.4, -0.95, 0.95], [-0.25, 0.45, 0.95, 1.0], [0.1, 1.7, 0.1, 0.95]]
      .map(([bx, by, bz, r]) => [bx * s, by * s, bz * s, r * s]);
    foliage(crown, blobs, hi ? 70 : 42, 1.35 * s, seed % 2);
    g.add(crown);
    root.add(g);
    trees.push({ crown, phase: seed * 1.7 });
  }
  tree(-12.2, -7.0, 1.15, 1); tree(-13.0, 2.8, 0.95, 2); tree(12.6, -8.2, 1.2, 3);
  tree(14.0, -2.5, 1.0, 4); tree(-11.6, 9.6, 0.85, 5); tree(5.0, -9.9, 0.95, 6); tree(-2.0, -9.6, 1.05, 7); tree(14.2, 9.6, 0.7, 8);

  // sebes e arbustos (instanciados)
  {
    const spots = [];
    for (let x = -14; x <= 14; x += 0.9) spots.push([x, -10.9, 0.62 + Math.sin(x * 1.3) * 0.12]);
    for (let z = -9; z <= 7; z += 0.95) spots.push([-14.8, z, 0.6 + Math.cos(z) * 0.1]);
    for (const [x, z] of [[-7.3, 4.4], [-7.3, 6.8], [5.85, 4.3], [1.1, 7.75], [9.4, 3.6], [9.6, -1.2], [9.5, -3.4], [-7.2, -2.0], [-7.0, 0.5]]) spots.push([x, z, 0.5 + Math.abs((x * z) % 0.25)]);
    const blobs = spots.map(([x, z, s]) => [x, s * 0.75, z, s]);
    foliage(root, blobs, hi ? 22 : 14, 0.7, 1);
  }
  // flores
  {
    const geo = new THREE.IcosahedronGeometry(0.032, 1);
    const cols = [0xf2c14e, 0xe86a7a, 0xffffff, 0xb07fd1, 0xf29d52];
    const pts = [];
    const beds = [[4.4, 6.0, 3.95, 4.7], [-7.7, -6.85, 3.8, 7.2], [0.5, 1.7, 7.3, 7.95]]; // fora do deck (x -6,6..1,8 · z 3,9..6,8)
    let seed = 1;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const [x0, x1, z0, z1] of beds) for (let i = 0; i < 160; i++) pts.push([x0 + r() * (x1 - x0), z0 + r() * (z1 - z0), r()]);
    const inst = new THREE.InstancedMesh(geo, std({ color: 0xffffff, roughness: 0.7 }), pts.length);
    const c = new THREE.Color();
    pts.forEach(([x, z, k], i) => {
      inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.1 + k * 0.16, z));
      inst.setColorAt(i, c.set(cols[i % cols.length]));
    });
    root.add(inst);
  }
  // tufos de grama (profundidade no gramado)
  {
    const a = new THREE.PlaneGeometry(0.42, 0.3); a.translate(0, 0.15, 0);
    const b = a.clone(); b.rotateY(Math.PI / 2);
    const geo = mergeGeometries([a, b]);
    const nrm = geo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0); // sombreia como o gramado
    const grassMat = new THREE.MeshStandardMaterial(cutout({ map: TX.grassBlades(), side: THREE.DoubleSide, roughness: 0.95 }, 0.5));
    const blocked = [[-6.8, 8.9, -4.2, 4.2], [-7.1, 2.0, 3.8, 6.9], [-7.0, -0.1, 7.1, 12], [2.1, 3.9, 3.8, 12], [6.1, 8.8, -4, 12]];
    const ok = (x, z) => !blocked.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
    const pts = [];
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (pts.length < (hi ? 4500 : 2000)) {
      const x = (r() - 0.5) * (LW - 1.2), z = (r() - 0.5) * (LD - 1.2);
      if (ok(x, z)) pts.push([x, z]);
    }
    const inst = new THREE.InstancedMesh(geo, grassMat, pts.length);
    inst.receiveShadow = true;
    const c = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler();
    pts.forEach(([x, z], i) => {
      const s = 0.55 + r() * 0.8;
      q.setFromEuler(e.set((r() - 0.5) * 0.25, r() * 6, (r() - 0.5) * 0.25));
      inst.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.8 + r() * 0.5), s)));
      const k = 0.62 + r() * 0.3;
      inst.setColorAt(i, c.setRGB(k, k, k * 0.9));
    });
    root.add(inst);
  }
  // pedras decorativas
  for (const [x, z, s] of [[-0.2, 7.3, 0.35], [0.2, 7.6, 0.22], [-7.3, 10.8, 0.4], [-6.9, 11.2, 0.25], [9.8, 11.2, 0.3]]) {
    const r = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), M.stone));
    r.position.set(x, s * 0.45, z);
    r.scale.y = 0.6;
    root.add(r);
  }

  // ================================================================
  // Dispositivos IoT — representação dos componentes reais do protoboard
  // (ampliados para ficarem visíveis na escala da casa)
  // ================================================================
  const zOut = 3.5 + T / 2; // face externa da parede sul

  // NodeMCU ESP8266 em caixa de vidro, na parede ao lado da porta
  const espLedMat = std({ color: 0x3aa0ff, emissive: 0x3aa0ff, emissiveIntensity: 2 });
  {
    const g = new THREE.Group();
    g.position.set(5.05, FL + 1.45, zOut);
    root.add(g);
    box(g, 0.46, 0.66, 0.05, M.whitePlastic, 0, 0, 0.025, { round: 0.02 });
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.64, 0.09), M.railGlass);
    cover.position.z = 0.1; g.add(cover);
    // NodeMCU v2: placa preta 49×26 mm, módulo ESP-12 com blindagem e antena em zigue-zague,
    // 2 fileiras de 15 pinos, micro-USB embaixo e botões RST/FLASH ao lado
    const pcb = box(g, 0.22, 0.42, 0.012, M.pcbBlack, 0, -0.01, 0.07);
    box(g, 0.13, 0.17, 0.006, M.pcbBlue, 0, 0.1, 0.078);       // módulo ESP-12
    box(g, 0.11, 0.11, 0.014, M.steel, 0, 0.08, 0.085);        // blindagem metálica
    for (let i = 0; i < 4; i++) box(g, 0.1, 0.008, 0.004, M.gold, 0, 0.165 + i * 0.012, 0.083, { cast: false }); // antena
    for (const side of [-1, 1]) for (let i = 0; i < 15; i++) box(g, 0.014, 0.014, 0.02, M.gold, side * 0.095, -0.2 + i * 0.026, 0.085, { cast: false });
    box(g, 0.05, 0.024, 0.02, M.steel, 0, -0.205, 0.083);      // micro-USB
    box(g, 0.025, 0.02, 0.016, M.black, -0.06, -0.17, 0.082);  // RST
    box(g, 0.025, 0.02, 0.016, M.black, 0.06, -0.17, 0.082);   // FLASH (botão do alarme, D3)
    box(g, 0.05, 0.05, 0.01, M.pcbBlack, 0, -0.08, 0.08);      // conversor USB-serial CH340
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 10), espLedMat);
    led.position.set(0.045, 0.02, 0.09); g.add(led);
    // cabo de dados subindo pela parede até a antena
    box(root, 0.03, SLAB0 - FL - 1.8, 0.03, M.frame, 5.05, FL + 1.8 + (SLAB0 - FL - 1.8) / 2, zOut + 0.02);
    anchor('mcu', 5.05, FL + 2.0, zOut + 0.1);
    void pcb;
  }

  // PIR HC-SR501 (sensor de presença, D5 → V11) ao lado da porta
  const scanMat = new THREE.MeshBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  let scanCone;
  {
    const g = new THREE.Group();
    g.position.set(4.35, FL + 1.05, zOut);
    root.add(g);
    box(g, 0.2, 0.2, 0.015, M.pcbGreen, 0, 0, 0.01);
    box(g, 0.16, 0.16, 0.02, M.whitePlastic, 0, 0, 0.025);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.fresnel);
    lens.rotation.x = Math.PI / 2; lens.position.z = 0.035; g.add(lens);
    for (const x of [-0.045, 0.045]) { // trimpots de sensibilidade e tempo
      const tp = cyl(g, 0.018, 0.018, 0.012, M.trimpot, x, -0.115, 0.02, 12);
      tp.rotation.x = Math.PI / 2;
    }
    scanCone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 32, 1, true), scanMat);
    scanCone.rotation.x = -Math.PI / 2;
    scanCone.position.set(0, -0.15, 1.25);
    g.add(scanCone);
    anchor('pir', 4.35, FL + 1.3, zOut + 0.1);
  }

  // HC-SR04 (ultrassom, TRIG D4 / ECHO D6 → V12) no fundo da garagem, medindo o carro.
  // Fica num poste com barra de LEDs de estacionamento (verde/âmbar/vermelho).
  const SONAR_Z = 0.95;                    // face do sensor (fundo da vaga)
  const parkMats = [0x36e39a, 0xffb020, 0xff3b55].map((c) => std({ color: 0x222222, emissive: c, emissiveIntensity: 0 }));
  const sonarMat = new THREE.MeshBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  let sonarBeam;
  {
    const g = new THREE.Group();
    g.position.set(7.1, 0, SONAR_Z - 0.06);
    root.add(g);
    box(g, 0.12, 1.25, 0.12, M.frame, 0, 0.625, 0);
    box(g, 0.3, 0.14, 0.015, M.pcbBlue, 0, 0.7, 0.07);
    for (const x of [-0.08, 0.08]) {
      const c = cyl(g, 0.048, 0.048, 0.07, M.steel, x, 0.7, 0.11, 24);
      c.rotation.x = Math.PI / 2;
      const mesh = cyl(g, 0.04, 0.04, 0.002, M.black, x, 0.7, 0.146, 24);
      mesh.rotation.x = Math.PI / 2;
    }
    box(g, 0.03, 0.02, 0.01, M.steel, 0, 0.75, 0.08); // cristal
    parkMats.forEach((m, i) => box(g, 0.08, 0.08, 0.04, m, (i - 1) * 0.1, 1.05, 0.07, { cast: false }));
    sonarBeam = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1, 24, 1, true), sonarMat);
    sonarBeam.rotation.x = -Math.PI / 2;
    sonarBeam.userData.dynamic = true;  // ponta no sensor, abre em direção ao carro
    g.add(sonarBeam);
    anchor('garagem', 7.1, 1.45, SONAR_Z);
  }

  // DHT11 (D2 → V4/V5) na parede leste, perto da janela — caixa azul
  {
    const g = new THREE.Group();
    g.position.set(6.0 + T / 2, FL + 1.85, 1.35);
    g.rotation.y = Math.PI / 2;
    root.add(g);
    box(g, 0.2, 0.3, 0.02, M.pcbBlue, 0, 0, 0.01);
    box(g, 0.16, 0.22, 0.06, M.dhtBlue, 0, 0.01, 0.05, { round: 0.01 });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) box(g, 0.022, 0.022, 0.01, M.black, -0.045 + c * 0.03, -0.06 + r * 0.035, 0.08, { cast: false });
    anchor('dht', 6.3, FL + 2.35, 1.35);
  }

  // LDR (A0 → V6/V10) na cobertura: decide se é dia ou noite para a luz automática
  {
    const g = new THREE.Group();
    g.position.set(7.4, ROOF0 + 0.3, 2.3);
    root.add(g);
    cyl(g, 0.1, 0.12, 0.12, M.whitePlastic, 0, 0.06, 0);
    cyl(g, 0.07, 0.07, 0.015, std({ color: 0xb4532a, roughness: 0.5 }), 0, 0.13, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.railGlass);
    dome.position.y = 0.12; g.add(dome);
    anchor('ldr', 7.4, ROOF0 + 0.75, 2.3);
  }

  // Antena Wi-Fi + anéis de dados
  const antennaTip = new THREE.Vector3(7.6, ROOF0 + 1.9, -3.0);
  cyl(root, 0.025, 0.04, 1.6, M.steel, 7.6, ROOF0 + 1.1, -3.0, 10);
  const tipMat = std({ color: 0x5ee7ff, emissive: 0x5ee7ff, emissiveIntensity: 2.5 });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), tipMat);
  tip.position.copy(antennaTip); root.add(tip);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.012, 8, 64), m);
    r.position.copy(antennaTip);
    r.rotation.x = Math.PI / 2;
    root.add(r);
    r.userData.dynamic = true;
    rings.push({ mesh: r, t: i / 3 });
  }

  // Sirene / alarme (buzzer) no canto da cobertura
  const beaconMat = std({ color: 0x5a0d14, emissive: 0xff1f3d, emissiveIntensity: 0.15, roughness: 0.3 });
  const beaconPos = new THREE.Vector3(-3.05, ROOF0 + 0.45, 2.55);
  {
    cyl(root, 0.14, 0.16, 0.12, M.frame, beaconPos.x, ROOF0 + 0.36, beaconPos.z);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat);
    dome.position.copy(beaconPos);
    root.add(dome);
    anchor('alarme', beaconPos.x, beaconPos.y + 0.45, beaconPos.z);
  }
  // As luzes do alarme ficam ACIMA da cúpula, longe de qualquer superfície. Antes o spot ficava
  // dentro da sirene: a ~3 cm da base a intensidade estourava o buffer HDR (meia precisão, máx. 65504),
  // virava Infinito/NaN e o bloom espalhava o NaN pela tela inteira → cena preta durante o alarme.
  let alarmSpot = null;
  if (hi) {
    alarmSpot = new THREE.SpotLight(0xff2340, 0, 40, 0.45, 0.6, 1.2);
    alarmSpot.position.copy(beaconPos).add(new THREE.Vector3(0, 0.6, 0));
    root.add(alarmSpot);
    root.add(alarmSpot.target);
  }
  const alarmPoint = new THREE.PointLight(0xff2340, 0, 14, 2);
  alarmPoint.position.copy(beaconPos).add(new THREE.Vector3(0, 0.8, 0.6));
  root.add(alarmPoint);
  // sem o spot (qualidades média/leve), uma poça vermelha varre o jardim no mesmo caminho do facho
  const alarmGlow = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xff2340, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), alarmGlow);
  sweep.rotation.x = -Math.PI / 2; sweep.renderOrder = 2; sweep.visible = !hi;
  sweep.userData.dynamic = true;
  root.add(sweep);

  // Holograma de presença na entrada (aparece quando o PIR detecta movimento)
  const holoMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0x5ee7ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.); vY = wp.y; vN = normalize(normalMatrix*normal);
        vec4 mv = viewMatrix*wp; vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; uniform float uOpacity; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float f = pow(clamp(1.-abs(dot(normalize(vN),vV)), 0., 1.), 2.2); /* clamp: pow de número negativo = NaN na placa de vídeo */ float scan = 0.55+0.45*sin(vY*60.-uTime*8.);
        float a = (f*1.2+0.12)*scan*uOpacity; gl_FragColor = vec4(uColor*(0.6+f*1.4), a); }`,
  });
  const holo = new THREE.Group();
  holo.userData.dynamic = true;
  holo.position.set(3.0, 0.08, 5.3);
  holo.rotation.y = Math.PI;
  {
    const add = (geo, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, holoMat); m.position.set(x, y, z); m.rotation.z = rz; holo.add(m); };
    add(new THREE.CapsuleGeometry(0.2, 0.5, 8, 16), 0, 1.2, 0);
    add(new THREE.SphereGeometry(0.13, 20, 16), 0, 1.72, 0);
    add(new THREE.CapsuleGeometry(0.075, 0.62, 6, 12), -0.1, 0.45, 0);
    add(new THREE.CapsuleGeometry(0.075, 0.62, 6, 12), 0.1, 0.45, 0);
    add(new THREE.CapsuleGeometry(0.06, 0.5, 6, 12), -0.3, 1.18, 0, 0.12);
    add(new THREE.CapsuleGeometry(0.06, 0.5, 6, 12), 0.3, 1.18, 0, -0.12);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.4, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    holo.add(ring);
    holo.userData.ring = ring;
  }
  holo.visible = false;
  root.add(holo);

  // ================================================================
  // Luzes internas/externas (ligadas ao V0)
  // ================================================================
  addPoint(0xffb86b, 22, 10, -3.0, 2.9, 1.3);        // sala (34 deixava mancha no teto)
  addPoint(0xffc98a, 18, 9, 2.6, 2.8, -1.2);          // jantar/cozinha
  addPoint(0xffb86b, 26, 8, 2.0, UFL + 2.5, -0.8);    // superior (quarto/escritório)
  // área externa: só a qualidade alta usa luzes reais; as outras usam poças de luz (mesmo visual, custo ~zero)
  const eaves = [[-4.8, 3.72, -4.8, 5.2, 0.12], [-0.4, 3.72, -0.4, 5.2, 0.12], [3.0, 3.72, 3.0, 4.9, 0.09], [7.2, 3.72, 7.2, 2.2, 0.09]];
  if (hi) {
    addPoint(0xffc27a, 10, 7, 3.0, 0.9, 7.6);         // caminho
    for (const [x, z, tx, tz] of eaves) {
      const sp = new THREE.SpotLight(0xffc88a, 0, 9, 0.62, 0.85, 2);
      sp.position.set(x, SLAB0 - 0.02, z);
      sp.target.position.set(tx, 0, tz);
      root.add(sp, sp.target);
      pointLights.push({ light: sp, base: 60 });
    }
  } else {
    for (const [, , tx, tz, y] of eaves) lightPool(0xffc88a, tx, y + 0.01, tz, 1.9, 1.9, 0.5);
    lightPool(0xffc27a, 3.0, 0.08, 7.6, 2.4, 3.2, 0.32);    // caminho
  }
  // piscina: poça ciano em todos os perfis (a luz pontual do perfil alto fazia uma "estrela" no azulejo)
  lightPool(0x46dcff, -3.6, 0.13, 8.9, 3.4, 1.9, 0.35);

  // ================================================================
  // Estado e animação
  // ================================================================
  const S = {
    light: 0, lightT: 0,
    door: 0, doorT: 0,
    win: 0, winT: 0,
    alarm: 0, alarmT: 0, armed: false,
    presence: 0, presenceT: 0,
    gap: 6, gapT: 6, carSpeed: 0, dist: NaN,
    online: false, pulse: 0,
    night: 0,
  };

  // TV da sala: mesmos valores do painel (fmt) + hora da última leitura.
  // Só redesenha quando algum texto muda ou o minuto do relógio vira (o canvas vai inteiro para a GPU).
  let tvV = {}, tvMeta = {}, tvSig = '', tvMinute = -1;
  function drawTV(v = tvV, meta = tvMeta, force = false) {
    tvV = v; tvMeta = meta;
    const now = new Date();
    tvMinute = Math.floor(now.getTime() / 60000);
    let status = 'CASA · DEMONSTRAÇÃO', warn = false;
    if (meta.mode === 'live') {
      if (!meta.blynkOnline) { status = 'CASA · BLYNK OFFLINE'; warn = true; }
      else if (!meta.deviceOnline) { status = 'CASA · NODEMCU OFFLINE'; warn = true; }
      else status = 'CASA · AO VIVO';
    }
    const clock = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const temp = fmt.temp(v.V4);
    const cards = [['UMIDADE', `${fmt.umid(v.V5)}%`], ['PRESENÇA', fmt.pres(v.V11)], ['JANELA', fmt.janela(v.V7)]];
    const read = `última leitura ${fmt.hora(meta.readAt)}`;
    const sig = JSON.stringify([status, clock, temp, cards, read]);
    if (sig === tvSig && !force) return;
    tvSig = sig;

    // poucos textos e grandes: na vista Sala a TV ocupa ~250 px na tela, letra pequena vira borrão
    const g = tvCanvas.getContext('2d'), W = 1024, H = 576;
    g.setTransform(TV_SCALE, 0, 0, TV_SCALE, 0, 0);
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#0b1422'); grd.addColorStop(1, '#13233a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // cabeçalho: status + relógio
    g.fillStyle = warn ? '#ffb547' : '#5ee7ff'; g.font = '700 40px "DM Sans", sans-serif';
    g.fillText(status, 48, 72);
    g.fillStyle = '#c3d3e6'; g.textAlign = 'right'; g.fillText(clock, W - 48, 72); g.textAlign = 'left';
    // temperatura grande à esquerda
    g.fillStyle = '#ffffff'; g.font = '700 168px "Unbounded", sans-serif';
    g.fillText(`${temp}°`, 40, 300);
    g.fillStyle = '#9fb4cc'; g.font = '500 36px "DM Sans", sans-serif';
    g.fillText('Temperatura · DHT11', 48, 356);
    // umidade / presença / janela em linhas largas embaixo
    cards.forEach(([k, val], i) => {
      const x = 40 + i * 320, w = 304;
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, 392, w, 136);
      g.fillStyle = '#9fb4cc'; g.font = '700 30px "DM Sans", sans-serif'; g.fillText(k, x + 20, 434);
      g.fillStyle = '#ffffff'; g.font = '700 54px "DM Sans", sans-serif'; g.fillText(val, x + 20, 500, w - 40);
    });
    g.fillStyle = '#7f96b1'; g.font = '500 26px "DM Sans", sans-serif';
    g.textAlign = 'right'; g.fillText(read, W - 48, 356); g.textAlign = 'left';
    tvTex.needsUpdate = true;
  }
  drawTV();
  // o primeiro desenho pode sair antes das fontes carregarem: redesenha quando estiverem prontas
  if (document.fonts) {
    Promise.all(['500 36px "DM Sans"', '700 40px "DM Sans"', '700 168px "Unbounded"']
      .map((f) => document.fonts.load(f))).then(() => { drawTV(tvV, tvMeta, true); drawRoom(tvV, true); }, () => {});
  }

  // painel da casa (andar de cima): temperatura grande + umidade, janela e alarme
  let roomSig = '';
  function drawRoom(v = tvV, force = false) {
    const temp = fmt.temp(v.V4);
    const rows = [['UMIDADE', `${fmt.umid(v.V5)}%`], ['JANELA', fmt.janela(v.V7)], ['ALARME', fmt.alarme(v.V8, v.V9)]];
    const sig = JSON.stringify([temp, rows]);
    if (sig === roomSig && !force) return;
    roomSig = sig;
    const g = roomCanvas.getContext('2d'), W = roomCanvas.width, H = roomCanvas.height;
    g.fillStyle = '#0d1828'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5ee7ff'; g.font = '700 48px "DM Sans", sans-serif'; g.fillText('CASA', 56, 90);
    g.fillStyle = '#ffffff'; g.font = '700 190px "Unbounded", sans-serif'; g.fillText(`${temp}°`, 44, 330);
    rows.forEach(([k, val], i) => {
      const y = 430 + i * 72;
      g.fillStyle = '#9fb4cc'; g.font = '700 40px "DM Sans", sans-serif'; g.fillText(k, 56, y);
      g.fillStyle = val === 'Disparado' ? '#ff5468' : '#ffffff'; g.font = '700 52px "DM Sans", sans-serif';
      g.textAlign = 'right'; g.fillText(val, W - 56, y); g.textAlign = 'left';
    });
    roomTex.needsUpdate = true;
  }
  drawRoom({});

  function setState(v, meta) {
    S.lightT = v.V0 === '1' ? 1 : 0;
    S.doorT = v.V1 === '1' ? 1 : 0;
    S.winT = v.V7 === 'ABERTA' ? 1 : 0;
    S.armed = v.V9 === '1';
    S.alarmT = /ATIVO/i.test(v.V8 || '') ? 1 : 0;
    S.presenceT = v.V11 === '1' ? 1 : 0;
    S.dist = v.V12 === undefined || v.V12 === '' ? NaN : Number(v.V12);
    S.gapT = distToGap(S.dist);
    if (!S.gotState) { S.gap = S.gapT; S.gotState = true; } // ao abrir, o carro já aparece onde está
    S.online = !!meta.deviceOnline;
    lockLedMat.color.set(S.doorT ? 0x36e39a : 0xff3b55);
    lockLedMat.emissive.set(S.doorT ? 0x36e39a : 0xff3b55);
    drawTV(v, meta);
    drawRoom(v);
    S.temp = Number(v.V4);
  }
  // cm medidos pelo HC-SR04 → metros entre o sensor e o para-choque na cena.
  // Na maquete o carrinho trabalha entre ~5 e 100 cm; acima disso a vaga está livre.
  function distToGap(cm) {
    if (!Number.isFinite(cm)) return 6;
    const k = THREE.MathUtils.clamp((cm - 4) / 96, 0, 1);
    return 0.12 + k * 5.9;
  }

  function pulse() { S.pulse = 1; rings.forEach((r) => (r.t = Math.min(r.t, 0.05))); }

  const tmpV = new THREE.Vector3();
  function update(dt, t) {
    // luzes (V0)
    S.light = damp(S.light, S.lightT, 5, dt);
    const nightBoost = 0.35 + S.night * 0.65;
    for (const p of pointLights) p.light.intensity = p.base * S.light * nightBoost;
    // lâmpadas/fitas: brilho contido à noite (antes chegava a 6,9 e o bloom "estourava")
    for (const [m, day, night] of lightMats) m.emissiveIntensity = S.light * (day + S.night * (night - day));
    for (const lp of lightPools) lp.mat.opacity = lp.base * S.light * (0.15 + S.night * 0.85);
    M.poolLight.emissiveIntensity = S.light * (0.3 + S.night * 0.3); // antes 2,8: virava uma estrela na água
    // relógio da TV: redesenha ao virar o minuto, mesmo sem estado novo
    if (Math.floor(Date.now() / 60000) !== tvMinute) drawTV();

    // sombras só são recalculadas quando algo que projeta sombra se move (ver main.js)
    S.moving = Math.abs(S.door - S.doorT) > 1e-3 || Math.abs(S.win - S.winT) > 1e-3 || Math.abs(S.gap - S.gapT) > 1e-3;

    // porta (V1) — abre para dentro
    S.door = damp(S.door, S.doorT, 3.2, dt);
    doorHinge.rotation.y = S.door * THREE.MathUtils.degToRad(78);

    // janela do servo (V7) — velocidade de servo SG90
    S.win = damp(S.win, S.winT, 3.8, dt);
    // ventilador do quarto: começa a girar em 26 °C e chega ao máximo em 30 °C (mesma faixa da janela automática)
    const fanT = S.temp >= 26 ? THREE.MathUtils.clamp((S.temp - 26) / 4, 0.3, 1) * 9 : 0;
    S.fan = damp(S.fan || 0, fanT, 1.2, dt);
    if (fan) fan.rotation.y += S.fan * dt;
    for (const sh of servoSashes) {
      if (sh.kind === 'casement') sh.hinge.rotation.y = -S.win * THREE.MathUtils.degToRad(82);
      else if (sh.kind === 'slide') sh.hinge.position.x = sh.x0 - S.win * sh.dist;
      else sh.hinge.rotation.x = -S.win * THREE.MathUtils.degToRad(38);
    }
    for (const c of curtains) c.scale.x = 1 - S.win * 0.8;

    // alarme
    S.alarm = damp(S.alarm, S.alarmT, 8, dt);
    const strobe = (Math.sin(t * 14) * 0.5 + 0.5);
    beaconMat.emissiveIntensity = S.alarm > 0.02
      ? 0.6 + strobe * 5 * S.alarm
      : (S.armed ? 0.25 + (Math.sin(t * 2.5) > 0.6 ? 1.6 : 0) : 0.12);
    if (alarmSpot) {
      alarmSpot.intensity = S.alarm * 600;
      alarmSpot.target.position.set(beaconPos.x + Math.cos(t * 3.2) * 9, 0, beaconPos.z + 4 + Math.sin(t * 3.2) * 7);
    }
    alarmPoint.intensity = S.alarm * (8 + strobe * 16);
    if (sweep.visible) {
      sweep.position.set(beaconPos.x + Math.cos(t * 3.2) * 9, 0.16, beaconPos.z + 4 + Math.sin(t * 3.2) * 7);
      alarmGlow.opacity = S.alarm * (0.35 + strobe * 0.5);
    }

    // presença
    S.presence = damp(S.presence, S.presenceT, 4, dt);
    holo.visible = S.presence > 0.01;
    holoMat.uniforms.uOpacity.value = S.presence;
    holoMat.uniforms.uTime.value = t;
    const rg = holo.userData.ring;
    const rs = 1 + ((t * 0.9) % 1) * 2.2;
    rg.scale.set(rs, rs, rs);
    rg.material.opacity = S.presence * (1 - ((t * 0.9) % 1));
    scanMat.opacity = (0.015 + S.presence * 0.07) * (0.6 + 0.4 * Math.sin(t * 9)) * (S.online ? 1 : 0.3);

    // garagem (V12): carro acompanha a distância medida, rodas giram, luz de freio ao parar
    const prevGap = S.gap;
    S.gap = damp(S.gap, S.gapT, 2.2, dt);
    const vel = dt > 0 ? (S.gap - prevGap) / dt : 0;
    const noseZ = SONAR_Z + S.gap;
    car.position.z = noseZ + 2.27 * 0.88;
    for (const w of carWheels) w.rotation.x -= (S.gap - prevGap) / (0.36 * 0.88);
    S.carSpeed = damp(S.carSpeed, Math.abs(vel) > 0.05 ? 1 : 0, 4, dt); // luz de freio enquanto manobra
    carTailMat.emissiveIntensity = 0.6 + S.carSpeed * 2.4;
    carHeadMat.emissiveIntensity = 0.25 + S.night * 2.2;
    const zone = !Number.isFinite(S.dist) ? -1 : S.dist <= 10 ? 2 : S.dist <= 30 ? 1 : S.dist <= 80 ? 0 : -1;
    const blink = zone === 2 ? (Math.sin(t * 18) > 0 ? 1 : 0.15) : 1;
    parkMats.forEach((m, i) => (m.emissiveIntensity = i === zone ? 2.2 * blink : 0.05));
    sonarBeam.scale.set(1, Math.max(0.1, S.gap), 1);
    sonarBeam.position.set(0, 0.7, 0.15 + S.gap / 2);
    sonarMat.opacity = S.online && zone >= 0 ? 0.05 + 0.04 * Math.sin(t * 12) : 0.012;

    // NodeMCU: pulsação enquanto conectado
    const beat = Math.pow(Math.max(0, Math.sin(t * 3.0)), 12);
    espLedMat.emissive.set(S.online ? 0x3aa0ff : 0xff5a3a);
    espLedMat.emissiveIntensity = S.online ? 1 + beat * 5 + S.pulse * 6 : 0.4 + beat * 2;
    tipMat.emissiveIntensity = S.online ? 1.5 + S.pulse * 5 : 0.3;
    S.pulse = damp(S.pulse, 0, 3, dt);

    // anéis Wi-Fi
    for (const r of rings) {
      r.t += dt * (S.online ? 0.45 : 0);
      if (r.t > 1) r.t -= 1;
      const s = 1 + r.t * 7;
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = S.online ? (1 - r.t) * (0.45 + S.pulse * 0.5) : 0;
    }

    // água e vento
    waterNormal.offset.x = t * 0.012;
    waterNormal.offset.y = t * 0.008;
    for (const tr of trees) {
      tr.crown.rotation.z = Math.sin(t * 0.9 + tr.phase) * 0.018;
      tr.crown.rotation.x = Math.cos(t * 0.7 + tr.phase) * 0.014;
    }
    void tmpV;
  }

  const stats = mergeStatic(root);

  return { root, anchors, setState, update, pulse, S, beaconPos, bounds: { LW, LD }, stats };
}

// ------------------------------------------------------------------
// Junta tudo o que é estático num mesh por material.
// A casa tem ~650 peças; cada uma era uma chamada de desenho (e de novo em cada passada de sombra).
// Depois de juntar, sobram poucas dezenas — é a maior economia para placa de vídeo integrada.
// Objetos que se movem (porta, janela, carro, copas…) ficam de fora via userData.dynamic.
// ------------------------------------------------------------------
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const isDynamic = (o) => { for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return true; return false; };
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || o.renderOrder !== 0) return;
    const m = o.material;
    if (Array.isArray(m) || m.transparent || !o.geometry.attributes.normal || isDynamic(o)) return;
    const g = o.geometry;
    const attrs = Object.keys(g.attributes).sort().join(',');
    const key = `${m.uuid}|${o.castShadow}|${o.receiveShadow}|${g.index ? 'i' : 'n'}|${attrs}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  let before = 0, after = 0;
  const mtx = new THREE.Matrix4();
  for (const list of groups.values()) {
    before += list.length;
    if (list.length < 2) { after += list.length; continue; }
    const geos = list.map((o) => { mtx.multiplyMatrices(inv, o.matrixWorld); return o.geometry.clone().applyMatrix4(mtx); });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) { after += list.length; continue; }
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    for (const o of list) {
      // filhos que NÃO foram juntados (porta, caixilhos do servo, grupos…) mudam para um suporte com a
      // mesma transformação do pai: continuam no lugar e com os eixos de dobradiça corretos
      if (o.children.length) {
        const holder = new THREE.Group();
        mtx.multiplyMatrices(inv, o.matrixWorld).decompose(holder.position, holder.quaternion, holder.scale);
        if (isDynamic(o)) holder.userData.dynamic = true;
        root.add(holder);
        for (const ch of [...o.children]) holder.add(ch);
      }
      o.removeFromParent();
    }
    root.add(mesh);
    after += 1;
  }
  return { before, after };
}
