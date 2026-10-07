// Mundo 3D: terreno flutuante, casa moderna, interior, jardim e dispositivos IoT.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

// ---------- medidas da casa (metros) ----------
const FL = 0.15;          // piso do térreo
const GH = 3.2;           // pé-direito térreo
const SLAB0 = FL + GH;    // 3.35 base da laje intermediária
const UFL = SLAB0 + 0.35; // 3.70 piso superior
const UH = 3.0;           // pé-direito superior
const ROOF0 = UFL + UH;   // 6.70
const T = 0.25;           // espessura das paredes

const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

export function buildWorld(scene, { quality = 'high' } = {}) {
  const hi = quality === 'high';
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
    fresnel: new THREE.MeshPhysicalMaterial({ color: 0xf4f4f0, roughness: 0.35, transmission: 0.3, thickness: 0.05 }),
    trimpot: std({ color: 0xe8a33a, roughness: 0.5 }),
    gold: std({ color: 0xd9b25a, metalness: 1, roughness: 0.3 }),
    carPaint: new THREE.MeshPhysicalMaterial({ color: 0x1d2b3c, metalness: 0.8, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }),
    rubber: std({ color: 0x111111, roughness: 0.9 }),
    tinted: new THREE.MeshPhysicalMaterial({ color: 0x0b0f14, metalness: 0.2, roughness: 0.05, clearcoat: 1 }),
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
  M.lampShade = warmEmissive();
  M.lampShade.side = THREE.DoubleSide;
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

  const lightMats = [M.lampShade, M.ledStrip, M.downlight, M.bollard];
  const pointLights = []; // { light, base }
  function addPoint(color, intensity, dist, x, y, z, shadow = false) {
    const l = new THREE.PointLight(color, 0, dist, 2);
    l.position.set(x, y, z);
    if (shadow && hi) {
      l.castShadow = true;
      l.shadow.mapSize.set(512, 512);
      l.shadow.bias = -0.002;
      l.shadow.radius = 3;
    }
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

  // Folha da porta (pivotada na dobradiça)
  const doorHinge = new THREE.Group();
  doorHinge.position.set(doorO.u + 0.07, 0, T * 0.62);
  southWall.add(doorHinge);
  const leafW = doorO.w - 0.14, leafH = doorO.h - 0.075;
  box(doorHinge, leafW, leafH, 0.06, M.walnut, leafW / 2, leafH / 2, 0);
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
  const sashHinge = new THREE.Group();
  sashHinge.position.set(servoO.u + 0.06, servoO.v + servoO.h / 2, T - 0.03);
  eastWall.add(sashHinge);
  {
    const sw = servoO.w - 0.12, sh = servoO.h - 0.12, fw = 0.055;
    box(sashHinge, sw, fw, 0.06, M.frame, sw / 2, sh / 2 - fw / 2, 0);
    box(sashHinge, sw, fw, 0.06, M.frame, sw / 2, -sh / 2 + fw / 2, 0);
    box(sashHinge, fw, sh, 0.06, M.frame, fw / 2, 0, 0);
    box(sashHinge, fw, sh, 0.06, M.frame, sw - fw / 2, 0, 0);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(sw - fw * 2, sh - fw * 2, 0.018), M.glass);
    pane.position.set(sw / 2, 0, 0);
    sashHinge.add(pane);
    box(sashHinge, 0.025, 0.16, 0.04, M.steel, sw - 0.09, 0, 0.05); // manopla
    // braço do servo (atuador) na base do caixilho
    box(eastWall, 0.12, 0.06, 0.05, M.pcbBlue, servoO.u + 0.25, servoO.v + 0.1, 0.05);
  }
  anchor('janela', 6.25, FL + servoO.v + servoO.h / 2 + 0.2, 0);

  // Parede norte (cozinha)
  const kitO = { u: 2.0, v: 1.1, w: 2.6, h: 1.1 };
  const nO = { u: 8.0, v: 0.9, w: 1.2, h: 1.6 };
  const northWall = placeWall(wall(12, GH, [kitO, nO], M.plaster), '-x', 6.0, -3.5, FL);
  frameOpening(northWall, kitO, { mullions: 1 });
  frameOpening(northWall, nO);

  // Parede oeste
  const wO = { u: 1.0, v: 0.3, w: 2.4, h: 2.5 };
  const westWall = placeWall(wall(7, GH, [wO], M.plaster), '+z', -3.5, -6.0, FL);
  frameOpening(westWall, wO, { mullions: 1 });

  // Laje intermediária com beiral
  box(root, 14.7, 0.35, 7.7, M.slab, 1.0, SLAB0 + 0.175, 0);
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
  box(root, 11.0, 0.01, 6.0, M.woodFloor, 2.5, UFL + 0.005, -0.5, { cast: false });
  const ribbonO = { u: 1.0, v: 0.8, w: 6.5, h: 1.5 };
  const ufSouth = placeWall(wall(11, UH, [ribbonO], M.darkPlaster), '+x', -3.0, 2.5, UFL);
  frameOpening(ufSouth, ribbonO, { mullions: 3 });
  const bedO = { u: 1.2, v: 0.4, w: 0.9, h: 2.2 };
  const ufEast = placeWall(wall(6, UH, [bedO], M.darkPlaster), '-z', 2.5, 8.0, UFL);
  frameOpening(ufEast, bedO, { sill: false });
  const ufNO = { u: 3.0, v: 0.9, w: 2.0, h: 1.3 };
  const ufNorth = placeWall(wall(11, UH, [ufNO], M.darkPlaster), '-x', 8.0, -3.5, UFL);
  frameOpening(ufNorth, ufNO);
  const slideO = { u: 1.0, v: 0, w: 3.4, h: 2.6 };
  const ufWest = placeWall(wall(6, UH, [slideO], M.darkPlaster), '+z', -3.5, -3.0, UFL);
  frameOpening(ufWest, slideO, { mullions: 1, sill: false });

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
    const rails = [
      { x: -6.25, z: 0, w: 0.02, d: 7.5 },
      { x: -4.65, z: 3.75, w: 3.2, d: 0.02 },
      { x: -4.65, z: -3.75, w: 3.2, d: 0.02 },
    ];
    for (const r of rails) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(r.w, railH, r.d), M.railGlass);
      g.position.set(r.x, UFL + railH / 2, r.z);
      root.add(g);
      box(root, Math.max(r.w, 0.05), 0.05, Math.max(r.d, 0.05), M.steel, r.x, UFL + railH, r.z);
    }
    // espreguiçadeiras
    for (const z of [-1.2, 0.2]) {
      box(root, 0.7, 0.3, 1.8, M.oak, -5.2, UFL + 0.15, z, { round: 0.04 });
      const back = box(root, 0.66, 0.08, 0.7, M.fabric, -5.2, UFL + 0.55, z - 0.62, { round: 0.03 });
      back.rotation.x = -0.9;
      box(root, 0.66, 0.08, 1.2, M.fabric, -5.2, UFL + 0.34, z + 0.25, { round: 0.03 });
    }
  }

  // ================================================================
  // Interior — térreo
  // ================================================================
  const interior = new THREE.Group(); root.add(interior);
  // Sala
  box(interior, 3.2, 0.012, 2.4, M.rug, -3.4, FL + 0.012, 1.3, { cast: false });
  {
    const sx = -2.1, sz = 1.2;
    box(interior, 1.0, 0.42, 2.8, M.fabric, sx, FL + 0.21, sz, { round: 0.06 });
    box(interior, 0.28, 0.5, 2.8, M.fabric, sx + 0.38, FL + 0.62, sz, { round: 0.08 });
    box(interior, 0.95, 0.3, 0.22, M.fabric, sx, FL + 0.55, sz - 1.39, { round: 0.08 });
    box(interior, 1.9, 0.42, 1.0, M.fabric, sx - 0.45, FL + 0.21, sz + 1.9, { round: 0.06 }); // chaise
    box(interior, 1.9, 0.5, 0.28, M.fabric, sx - 0.45, FL + 0.62, sz + 2.28, { round: 0.08 });
    for (let i = 0; i < 3; i++) box(interior, 0.2, 0.42, 0.75, M.fabric, sx + 0.18, FL + 0.66, sz - 0.9 + i * 0.85, { round: 0.1 });
    box(interior, 0.14, 0.34, 0.42, M.fabricGreen, sx + 0.05, FL + 0.6, sz - 1.0, { round: 0.08 }).rotation.z = 0.2;
    box(interior, 0.14, 0.34, 0.42, M.fabricRust, sx + 0.05, FL + 0.6, sz + 0.9, { round: 0.08 }).rotation.z = 0.2;
    // mesa de centro
    box(interior, 0.7, 0.05, 1.2, M.walnut, -3.4, FL + 0.38, 1.2, { round: 0.02 });
    for (const [dx, dz] of [[-0.28, -0.52], [0.28, -0.52], [-0.28, 0.52], [0.28, 0.52]]) box(interior, 0.03, 0.36, 0.03, M.black, -3.4 + dx, FL + 0.18, 1.2 + dz);
    box(interior, 0.25, 0.08, 0.18, M.ceramic, -3.35, FL + 0.44, 1.0, { round: 0.03 });
  }
  // parede de TV com ripado + TV exibindo dados reais
  {
    const ripGeo = new THREE.BoxGeometry(0.04, 2.9, 0.05);
    const n = 30, inst = shadowed(new THREE.InstancedMesh(ripGeo, M.walnut, n));
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m4.makeTranslation(-5.83, FL + 1.5, -0.3 + i * 0.1); inst.setMatrixAt(i, m4); }
    interior.add(inst);
    box(interior, 0.42, 0.42, 2.6, M.cabinet, -5.6, FL + 0.21, 1.15);
  }
  const tvCanvas = document.createElement('canvas');
  tvCanvas.width = 1024; tvCanvas.height = 576;
  const tvTex = new THREE.CanvasTexture(tvCanvas);
  tvTex.colorSpace = THREE.SRGBColorSpace;
  const tvMat = std({ color: 0x000000, emissive: 0xffffff, emissiveMap: tvTex, emissiveIntensity: 0.9, roughness: 0.2 });
  box(interior, 0.05, 1.0, 1.72, M.black, -5.74, FL + 1.45, 1.15);
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.94), tvMat);
  tvScreen.position.set(-5.71, FL + 1.45, 1.15);
  tvScreen.rotation.y = Math.PI / 2;
  interior.add(tvScreen);
  anchor('tv', -5.5, FL + 2.15, 1.15);

  // luminária de arco
  {
    cyl(interior, 0.18, 0.2, 0.04, M.black, -1.2, FL + 0.02, 2.6);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.018, 8, 40, Math.PI * 0.62), M.steel);
    arc.position.set(-2.2, FL + 1.1, 2.6); arc.rotation.z = -0.05;
    interior.add(arc);
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.lampShade);
    shade.position.set(-3.05, FL + 1.95, 2.6);
    interior.add(shade);
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
    pend.material = M.lampShade;
    pend.position.set(0, SLAB0 - 1.15, -1.4);
    interior.add(pend);
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
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), M.lampShade);
      s.position.set(x, SLAB0 - 1.35, -1.0);
      interior.add(s);
    }
    box(interior, 0.4, 0.3, 0.3, M.steel, 5.2, FL + 1.07, -3.1, { round: 0.03 }); // cafeteira
    plant(interior, 2.2, -3.1, 0.5, FL + 0.92);
  }

  // Fita de LED no forro (sanca)
  for (const [w, d, x, z] of [[11.6, 0.03, 0, 3.28], [11.6, 0.03, 0, -3.28], [0.03, 6.5, -5.78, 0], [0.03, 6.5, 5.78, 0]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), M.ledStrip);
    s.position.set(x, SLAB0 - 0.03, z);
    interior.add(s);
  }

  // Interior — superior (quarto e escritório)
  {
    box(interior, 1.9, 0.35, 2.1, M.oak, 5.6, UFL + 0.175, -2.2, { round: 0.03 });
    box(interior, 1.8, 0.22, 2.0, M.whitePlastic, 5.6, UFL + 0.46, -2.2, { round: 0.08 });
    box(interior, 1.85, 0.12, 1.3, M.fabricGreen, 5.6, UFL + 0.6, -1.8, { round: 0.05 });
    box(interior, 2.2, 1.1, 0.08, M.walnut, 5.6, UFL + 0.75, -3.3);
    for (const x of [4.3, 6.9]) {
      box(interior, 0.45, 0.5, 0.4, M.walnut, x, UFL + 0.25, -3.1);
      cyl(interior, 0.1, 0.12, 0.28, M.lampShade, x, UFL + 0.64, -3.1);
    }
    box(interior, 1.4, 0.04, 0.6, M.oak, -1.3, UFL + 0.74, -3.05);
    box(interior, 0.6, 0.36, 0.03, M.black, -1.3, UFL + 1.0, -3.2);
    box(interior, 2.2, 2.4, 0.6, M.cabinet, 1.8, UFL + 1.2, -3.05);
    plant(interior, 0.2, 2.0, 0.8, UFL);
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
    // espreguiçadeiras da piscina
    for (const x of [-5.4, -4.0]) {
      box(root, 0.7, 0.3, 1.8, M.oak, x, 0.15, 11.2, { round: 0.04 });
      box(root, 0.66, 0.08, 1.2, M.fabric, x, 0.34, 11.45, { round: 0.03 });
      const b = box(root, 0.66, 0.08, 0.7, M.fabric, x, 0.52, 10.6, { round: 0.03 });
      b.rotation.x = 0.9;
    }
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
  const carWheels = [];
  const carHeadMat = std({ color: 0xffffff, emissive: 0xdfefff, emissiveIntensity: 0.25 });
  const carTailMat = std({ color: 0x550000, emissive: 0xff2030, emissiveIntensity: 0.8 });
  {
    car.position.set(7.1, 0.05, 7.4);   // afastado do pilar da garagem (x = 8.15)
    car.scale.setScalar(0.88);
    car.rotation.y = Math.PI; // frente (faróis, +z local) virada para o fundo da garagem
    box(car, 1.85, 0.62, 4.5, M.carPaint, 0, 0.62, 0, { round: 0.22 });
    box(car, 1.62, 0.52, 2.5, M.tinted, 0, 1.12, -0.25, { round: 0.25 });
    for (const [x, z] of [[-0.86, 1.4], [0.86, 1.4], [-0.86, -1.45], [0.86, -1.45]]) {
      // roda num grupo próprio para girar conforme o carro anda
      const wg = new THREE.Group();
      wg.position.set(x, 0.36, z);
      car.add(wg);
      const w = cyl(wg, 0.36, 0.36, 0.24, M.rubber, 0, 0, 0, 28);
      w.rotation.z = Math.PI / 2;
      const rim = cyl(wg, 0.22, 0.22, 0.25, M.steel, 0, 0, 0, 20);
      rim.rotation.z = Math.PI / 2;
      for (let k = 0; k < 5; k++) { // raios: deixam a rotação visível
        const sp = box(wg, 0.26, 0.05, 0.035, M.frame, 0, 0, 0, { cast: false });
        sp.rotation.x = (k / 5) * Math.PI;
      }
      carWheels.push(wg);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.02), carHeadMat);
    head.position.set(0, 0.78, 2.26); car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.02), carTailMat);
    tail.position.set(0, 0.8, -2.26); car.add(tail);
    root.add(car);
  }

  // folhagem realista: miolo escuro + centenas de cartões de folhas com recorte alfa
  const leafTex = TX.leafCluster(201);
  const leafTex2 = TX.leafCluster(202, [[0.2, 0.5, 0.3], [0.23, 0.55, 0.24], [0.18, 0.45, 0.36], [0.26, 0.5, 0.2]]);
  const leafCardMat = [leafTex, leafTex2].map((map) => new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.78 }));
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
    for (const [x, z] of [[-6.9, 4.4], [-7.1, 6.8], [5.85, 4.3], [1.0, 4.4], [9.4, 3.6], [9.6, -1.2], [9.5, -3.4], [-7.2, -2.0], [-7.0, 0.5]]) spots.push([x, z, 0.5 + Math.abs((x * z) % 0.25)]);
    const blobs = spots.map(([x, z, s]) => [x, s * 0.75, z, s]);
    foliage(root, blobs, hi ? 22 : 14, 0.7, 1);
  }
  // flores
  {
    const geo = new THREE.IcosahedronGeometry(0.032, 1);
    const cols = [0xf2c14e, 0xe86a7a, 0xffffff, 0xb07fd1, 0xf29d52];
    const pts = [];
    const beds = [[4.4, 6.0, 3.95, 4.7], [-7.4, -6.6, 3.8, 7.2], [0.2, 1.7, 4.0, 4.7]];
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
    const grassMat = new THREE.MeshStandardMaterial({ map: TX.grassBlades(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
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
    sonarBeam.rotation.x = -Math.PI / 2;  // ponta no sensor, abre em direção ao carro
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
    anchor('dht', 6.3, FL + 2.2, 1.35);
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
  const alarmSpot = new THREE.SpotLight(0xff2340, 0, 40, 0.45, 0.6, 1.2);
  alarmSpot.position.copy(beaconPos);
  root.add(alarmSpot);
  root.add(alarmSpot.target);
  const alarmPoint = new THREE.PointLight(0xff2340, 0, 12, 2);
  alarmPoint.position.copy(beaconPos).add(new THREE.Vector3(0, 0.3, 0.3));
  root.add(alarmPoint);

  // Holograma de presença na entrada (aparece quando o PIR detecta movimento)
  const holoMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0x5ee7ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.); vY = wp.y; vN = normalize(normalMatrix*normal);
        vec4 mv = viewMatrix*wp; vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; uniform float uOpacity; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float f = pow(1.-abs(dot(vN,vV)), 2.2); float scan = 0.55+0.45*sin(vY*60.-uTime*8.);
        float a = (f*1.2+0.12)*scan*uOpacity; gl_FragColor = vec4(uColor*(0.6+f*1.4), a); }`,
  });
  const holo = new THREE.Group();
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
  addPoint(0xffb86b, 34, 10, -3.0, 2.9, 1.3, true);  // sala
  addPoint(0xffc98a, 26, 9, 2.6, 2.8, -1.2);          // jantar/cozinha
  addPoint(0xffb86b, 26, 8, 2.0, UFL + 2.5, -0.8);    // superior (quarto/escritório)
  addPoint(0xffc27a, 10, 7, 3.0, 0.9, 7.6);           // caminho
  addPoint(0x46dcff, 10, 6, -3.6, 0.35, 8.9);         // piscina
  // fachos dos spots do beiral (luz arquitetônica sobre deck, entrada e garagem)
  for (const [x, z, tx, tz] of [[-4.8, 3.72, -4.8, 5.2], [-0.4, 3.72, -0.4, 5.2], [3.0, 3.72, 3.0, 4.9], [7.2, 3.72, 7.2, 2.2]]) {
    const sp = new THREE.SpotLight(0xffc88a, 0, 9, 0.62, 0.85, 2);
    sp.position.set(x, SLAB0 - 0.02, z);
    sp.target.position.set(tx, 0, tz);
    root.add(sp, sp.target);
    pointLights.push({ light: sp, base: 60 });
  }

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

  function drawTV(v = {}, meta = {}) {
    const g = tvCanvas.getContext('2d'), W = tvCanvas.width, H = tvCanvas.height;
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#0b1422'); grd.addColorStop(1, '#13233a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5ee7ff'; g.font = '600 30px "JetBrains Mono", monospace';
    g.fillText(meta.live ? 'CASA · AO VIVO' : 'CASA · DEMONSTRAÇÃO', 56, 76);
    g.fillStyle = '#8aa3bf'; g.font = '400 26px "DM Sans", sans-serif';
    const d = new Date();
    g.fillText(d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), W - 150, 76);
    g.fillStyle = '#ffffff'; g.font = '700 170px "Unbounded", sans-serif';
    g.fillText(`${v.V4 ? Number(v.V4).toFixed(1) : '--'}°`, 50, 300);
    g.fillStyle = '#8aa3bf'; g.font = '500 30px "DM Sans", sans-serif';
    g.fillText('temperatura interna · DHT11', 58, 350);
    const cards = [['UMIDADE', `${v.V5 ?? '--'}%`], ['LUZ', `${v.V10 ?? '--'}%`], ['JANELA', v.V7 ?? '--']];
    cards.forEach(([k, val], i) => {
      const x = 56 + i * 316;
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x, 400, 290, 120);
      g.fillStyle = '#8aa3bf'; g.font = '600 22px "JetBrains Mono", monospace'; g.fillText(k, x + 22, 444);
      g.fillStyle = '#ffffff'; g.font = '700 40px "DM Sans", sans-serif'; g.fillText(val, x + 22, 496);
    });
    tvTex.needsUpdate = true;
  }
  drawTV();

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
    for (const m of lightMats) m.emissiveIntensity = S.light * (1.4 + S.night * 5.5);
    M.poolLight.emissiveIntensity = S.light * (1 + S.night * 1.8);

    // porta (V1) — abre para dentro
    S.door = damp(S.door, S.doorT, 3.2, dt);
    doorHinge.rotation.y = S.door * THREE.MathUtils.degToRad(78);

    // janela do servo (V7) — velocidade de servo SG90
    S.win = damp(S.win, S.winT, 3.8, dt);
    sashHinge.rotation.y = -S.win * THREE.MathUtils.degToRad(82);

    // alarme
    S.alarm = damp(S.alarm, S.alarmT, 8, dt);
    const strobe = (Math.sin(t * 14) * 0.5 + 0.5);
    beaconMat.emissiveIntensity = S.alarm > 0.02
      ? 0.6 + strobe * 5 * S.alarm
      : (S.armed ? 0.25 + (Math.sin(t * 2.5) > 0.6 ? 1.6 : 0) : 0.12);
    alarmSpot.intensity = S.alarm * 900;
    alarmPoint.intensity = S.alarm * (6 + strobe * 14);
    alarmSpot.target.position.set(beaconPos.x + Math.cos(t * 3.2) * 9, 0, beaconPos.z + 4 + Math.sin(t * 3.2) * 7);

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

  return { root, anchors, setState, update, pulse, S, beaconPos, bounds: { LW, LD } };
}
