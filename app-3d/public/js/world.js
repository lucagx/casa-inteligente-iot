// Mundo 3D: terreno flutuante, casa moderna, interior, jardim e dispositivos IoT.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MODELOS } from './config.js';
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
// piscina (centro, largura x, comprimento z) e profundidade real: o terreno tem um furo do tamanho dela
const POOL = { x: -3.6, z: 8.9, w: 6.0, d: 3.0, depth: 1.3 };
// escada: degraus flutuantes na parede norte da sala, sobem para +x até o andar de cima
const ST_N = 18, ST_R = (UFL - FL) / ST_N, ST_G = 0.25;
const ST_X0 = -4.9;                          // pé da escada: ~1 m livre até a parede oeste para chegar nela
const ST_X1 = ST_X0 + (ST_N - 1) * ST_G;     // -0,65: chegada no andar de cima
const ST_Z0 = -3.5 + T / 2, ST_Z1 = ST_Z0 + 0.85; // face interna da parede norte → borda livre
const VOID_X0 = -3.0 + T / 2;                // vão na laje começa na face interna da parede oeste de cima

const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

// quality: 'high' | 'medium' | 'low' (ver main.js → perfis de qualidade)
export function buildWorld(scene, { quality = 'high', sensores = { ldr: true, garagem: true }, onCreditoCarro = null } = {}) {
  const hi = quality === 'high';
  // perfis com MSAA usam alpha-to-coverage: borda de folha suave em vez de serrilhada e "cintilante"
  const a2c = quality !== 'low';
  const cutout = (o, test) => Object.assign(o, a2c ? { alphaToCoverage: true, alphaTest: 0.3 } : { alphaTest: test });
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
    grass: std({ map: TX.grass(), bumpMap: TX.grassBump(), bumpScale: 1.2, roughness: 0.96 }),
    soil: std({ map: TX.soil(), roughness: 1 }),
    rock: std({ map: TX.rock(), roughness: 0.95 }),
    stone: std({ map: tex(TX.stone, [1, 1]), roughness: 0.82 }),
    // lajotas de concreto fotográficas (Poly Haven concrete_tiles_02, CC0): caminho até a porta e o patamar da entrada
    pathTile: std({ ...TX.photoMaps('concrete_tiles_02', { repeat: [1 / 1.825, 1 / 1.825], leve: quality === 'low' }), roughness: 1 }),
    tile: std({ map: TX.poolTile(), roughness: 0.25 }),
    fabric: new THREE.MeshPhysicalMaterial({ color: 0xd3cbbd, roughness: 1, sheen: 1, sheenRoughness: 0.8, sheenColor: 0xffffff }),
    fabricGreen: new THREE.MeshPhysicalMaterial({ color: 0x4f6b58, roughness: 1, sheen: 1, sheenRoughness: 0.7, sheenColor: 0xbfd6c5 }),
    fabricRust: new THREE.MeshPhysicalMaterial({ color: 0xb4673f, roughness: 1, sheen: 1, sheenRoughness: 0.7, sheenColor: 0xf0c3a0 }),
    rug: std({ map: TX.rug(), roughness: 1 }),
    quartz: std({ color: 0xf1eee9, roughness: 0.22 }),
    cabinet: std({ color: 0x353b42, roughness: 0.5, metalness: 0.1 }),
    ceramic: std({ color: 0xe8e2d6, roughness: 0.6 }),
    terracotta: std({ color: 0xa65a3a, roughness: 0.85 }),
    bark: std({ map: tex(TX.bark, [2, 1]), roughness: 0.95 }),
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
    // pouco opaca e com reflexo moderado: o fundo de 1,3 m aparece (antes parecia um piso sólido)
    color: 0x2a9cc0, metalness: 0, roughness: 0.06, normalMap: waterNormal, normalScale: new THREE.Vector2(0.3, 0.3),
    transparent: true, opacity: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.08, envMapIntensity: 0.6, depthWrite: false,
  });

  // luzes emissivas por cômodo (state.rooms); o LED do D1 (V0) é a luz geral, aceso se algum cômodo estiver aceso
  // cada cômodo tem o próprio material: mergeStatic() junta por material, então eles continuam separados
  const warmEmissive = () => std({ color: 0xfff4e2, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.4 });
  // cúpulas opacas (não acendem); só a lâmpada dentro delas brilha
  M.lampShade = std({ color: 0xece6dc, roughness: 0.75, side: THREE.DoubleSide });
  M.lampMetal = std({ color: 0x1d1f22, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide });
  M.bulb = warmEmissive();        // sala
  M.bulbCozinha = warmEmissive();
  M.bulbQuarto = warmEmissive();
  M.ledStrip = warmEmissive();
  M.downlight = warmEmissive();
  M.bollard = warmEmissive();
  M.poolLight = std({ color: 0xbff4ff, emissive: 0x3fd8ff, emissiveIntensity: 0 });
  M.uplight = warmEmissive(); // V2: spots de chão, réguas da fachada e fita sob o deck
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
  // laje w × h × d com topo em topY e um furo retangular [x0, x1, z0, z1]; r = raio das bordas.
  // UVs refeitos para o mesmo mapeamento 0..1 por face de uma BoxGeometry (texturas e repeat iguais)
  function slabWithHole(w, h, d, [x0, x1, z0, z1], mat, topY, r) {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -d / 2 + r); sh.lineTo(w / 2 - r, -d / 2 + r); sh.lineTo(w / 2 - r, d / 2 - r); sh.lineTo(-w / 2 + r, d / 2 - r); sh.closePath();
    // o chanfro cresce r para dentro do furo: o furo desenhado é r maior para terminar na medida certa
    const hp = new THREE.Path();
    hp.moveTo(x0 - r, z0 - r); hp.lineTo(x0 - r, z1 + r); hp.lineTo(x1 + r, z1 + r); hp.lineTo(x1 + r, z0 - r); hp.closePath();
    sh.holes.push(hp);
    const g = new THREE.ExtrudeGeometry(sh, { depth: h - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 1 });
    g.rotateX(Math.PI / 2);                 // forma (x, y) → chão (x, z); extrusão para baixo
    g.translate(0, topY - r, 0);
    g.computeVertexNormals();
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv, y0 = topY - h;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
      if (ay >= ax && ay >= az) uv.setXY(i, x / w + 0.5, 0.5 - z / d);
      else if (ax > az) uv.setXY(i, z / d + 0.5, (y - y0) / h);
      else uv.setXY(i, x / w + 0.5, (y - y0) / h);
    }
    const m = shadowed(new THREE.Mesh(g, mat), false, true);
    root.add(m);
    return m;
  }
  // caixa com UV em metros (azulejo do mesmo tamanho em qualquer face; o material usa repeat 1)
  function tiledBox(parent, w, h, d, mat, x, y, z) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x, -x, +y, -y, +z, -z
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    const m = shadowed(new THREE.Mesh(g, mat), false, true);
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
  // [material, dia, noite, cômodo]
  const lightMats = [
    [M.bulb, 1.0, 2.0, 'sala'], [M.ledStrip, 0.5, 0.9, 'sala'], [M.bulbCozinha, 1.0, 2.0, 'cozinha'],
    [M.bulbQuarto, 1.0, 2.0, 'quarto'], [M.downlight, 0.5, 0.9, 'externa'], [M.bollard, 0.6, 1.2, 'externa'],
    [M.uplight, 0.4, 1.1, 'externa'],
  ];
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
  const lightPools = []; // { mat, base, zone, noite }
  // V2: cáusticas — soma de ondas, sem pow/normalize (NaN apaga a tela com o bloom); l fica sempre em 0..1
  const causticMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0x9ff4ff) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        vec2 p = vUv * vec2(9.0, 4.5);
        float v = sin(p.x * 3.1 + uTime * 1.3 + sin(p.y * 2.3 + uTime * 0.9))
                + sin(p.y * 3.7 - uTime * 1.1 + sin(p.x * 2.9 - uTime * 0.7))
                + sin((p.x + p.y) * 2.6 + uTime * 0.8);
        float l = clamp(1.0 - abs(v / 3.0), 0.0, 1.0);
        l = l * l * l * l;
        vec2 e = min(vUv, 1.0 - vUv);
        float borda = clamp(min(e.x * 8.0, e.y * 4.0), 0.0, 1.0);
        gl_FragColor = vec4(uColor * (0.1 + l * 0.9) * borda * uOpacity, 1.0);
      }`,
  });
  function lightPool(color, x, y, z, rx, rz = rx, base = 0.55, zone = 'sala') {
    const mat = new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 2; m.userData.semAO = true;
    root.add(m);
    lightPools.push({ mat, base, zone });
  }
  // ---------- V2: iluminação noturna (tudo aditivo/emissivo, sem luz nova) ----------
  // brilho em faixa: forte embaixo, some para cima e nas laterais (luz rasante, fita de LED, paredes da piscina)
  const washTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const v = g.createLinearGradient(0, 128, 0, 0);
    v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    v.addColorStop(0.6, 'rgba(255,255,255,0.15)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, 64, 128);
    g.globalCompositeOperation = 'destination-in';
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.15, 'rgba(0,0,0,1)'); h.addColorStop(0.85, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = h; g.fillRect(0, 0, 64, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  // vários planos com o mesmo brilho num só desenho (transparente não entra no mergeStatic).
  // quad: { w, h, x, y, z, chao (deitado), inv (deitado com o lado forte para -z), ry }
  // noite: só aparece à noite (brilho de jardim/fachada de dia não faz sentido)
  function glowBatch(map, color, quads, base, zone = 'externa', noite = true) {
    const geo = mergeGeometries(quads.map((q) => {
      const g = new THREE.PlaneGeometry(q.w, q.h);
      if (q.chao) g.rotateX(q.inv ? Math.PI / 2 : -Math.PI / 2);
      if (q.ry) g.rotateY(q.ry);
      return g.translate(q.x, q.y, q.z);
    }));
    const mat = new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: true, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 2; m.userData.semAO = true; // fora do AO (main.js)
    root.add(m);
    lightPools.push({ mat, base, zone, noite });
  }
  // halos que sempre olham para a câmera (sprites com um só material)
  function halos(color, pts, base, zone = 'externa') {
    const mat = new THREE.SpriteMaterial({ map: poolTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const [x, y, z, size] of pts) { const sp = new THREE.Sprite(mat); sp.position.set(x, y, z); sp.scale.setScalar(size); sp.renderOrder = 3; root.add(sp); }
    lightPools.push({ mat, base, zone, noite: true });
  }
  const pointLights = []; // { light, base, zone }
  // Luzes pontuais custam em TODO pixel de TODO material padrão, mesmo apagadas,
  // por isso são poucas e nenhuma projeta sombra (sombra de luz pontual = 6 renders extras da cena).
  function addPoint(color, intensity, dist, x, y, z, zone) {
    const l = new THREE.PointLight(color, 0, dist, 2);
    l.position.set(x, y, z);
    root.add(l);
    pointLights.push({ light: l, base: intensity, zone });
    return l;
  }

  const anchors = {};
  const anchor = (name, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); root.add(o); anchors[name] = o; return o; };

  // ================================================================
  // Terreno flutuante (maquete em corte)
  // ================================================================
  const LW = 32, LD = 24;
  // grama e solo são lajes com o furo da piscina (Extrude com chanfro = bordas arredondadas como antes)
  const poolHole = [POOL.x - POOL.w / 2, POOL.x + POOL.w / 2, POOL.z - POOL.d / 2, POOL.z + POOL.d / 2];
  slabWithHole(LW, 0.4, LD, poolHole, M.grass, 0, 0.18);
  slabWithHole(LW - 0.35, 1.6, LD - 0.35, poolHole, M.soil, -0.4, 0.12);
  M.soil.map.repeat.set(5, 1);
  box(root, LW - 0.9, 2.2, LD - 0.9, M.rock, 0, -3.1, 0, { round: 0.3 });
  box(root, LW - 3.5, 1.2, LD - 3.5, M.rock, 0, -4.6, 0, { round: 0.5 });

  // Garagem: vaga de 3,6 m entre a parede leste (x = 6,3) e os pilares; marquise da laje até GAR_X1; carro no meio
  const GAR_X1 = 9.9, CARRO_X = 8.0;
  const PISO_TOPO = 0.012; // topo do piso da garagem e das pedras do caminho: quase rente à grama (y = 0)
  // ================================================================
  // Casa — térreo
  // ================================================================
  box(root, 12.6, FL, 7.6, M.concrete, 0, FL / 2, 0);                 // base
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
  // degrau da entrada: o embasamento da casa vai até z = 3,8 (topo no piso, y = FL); daí até z = 4,125, onde começa o
  // caminho (topo a 2,5 cm), fica um degrau de 9 cm da mesma lajota do caminho, encostado na 1ª lajota e no embasamento.
  // Coordenadas locais da parede: z = mundo − 3,375 · y = mundo − FL
  // mesma largura (1,5 m) e mesma escala de textura do caminho, para ler como a primeira lajota, só mais alta
  tiledBox(jamb, 1.5, 0.1, 0.325, M.pathTile, doorO.u + doorO.w / 2, -0.11, T + 0.3375);
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
    const sx0 = -6.35, sx1 = GAR_X1, sz0 = -3.85, sz1 = 3.85, y = SLAB0 + 0.175; // sx1: marquise sobre a vaga
    const part = (x0, x1, z0, z1) => box(root, x1 - x0, 0.35, z1 - z0, M.slab, (x0 + x1) / 2, y, (z0 + z1) / 2);
    part(sx0, sx1, ST_Z1, sz1);
    part(sx0, VOID_X0, sz0, ST_Z1);
    part(ST_X1, sx1, sz0, ST_Z1);
    part(VOID_X0, ST_X1, sz0, ST_Z0);
  }
  box(root, GAR_X1 + 6.35, 0.02, 0.02, M.frame, (GAR_X1 - 6.35) / 2, SLAB0 + 0.02, 3.86, { cast: false }); // friso de sombra
  // pilares da garagem
  for (const z of [3.55, -3.55]) box(root, 0.18, SLAB0, 0.18, M.frame, GAR_X1 - 0.2, SLAB0 / 2, z);
  // spots embutidos no beiral
  const downGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20);
  for (const x of [-4.8, -2.6, -0.4, 3.0, 5.0, CARRO_X, GAR_X1 - 0.6]) {
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
  // ================================================================
  // V1: plantas com estrutura de verdade — o mesmo gerador para árvores, arbustos e vasos.
  // Galhos: cilindros que afinam e se dividem (casca unida numa malha). Folhas: raminhos desenhados (cartões com
  // recorte alfa) presos perto dos ramos, virados para fora da planta — a normal aponta para fora e a luz cai
  // como num volume. Por dentro e por baixo mais escuro (sombra própria), topo e borda mais claros.
  // ================================================================
  const sprigMats = [TX.leafSprig(201, 0.27), TX.leafSprig(202, 0.3), TX.leafSprig(203, 0.24)]
    .map((map) => new THREE.MeshStandardMaterial(cutout({ map, side: THREE.DoubleSide, roughness: 0.72 }, 0.45)));
  const cardGeo = new THREE.PlaneGeometry(1, 1);
  const zAxis = new THREE.Vector3(0, 0, 1), yAxis = new THREE.Vector3(0, 1, 0);
  /**
   * Galhada: a partir de hastes [{ p, dir, comp, raio }], cada nível divide em `filhos` galhos menores.
   * o: { rnd, comp: [mult por nível], abre: [ângulo por nível], filhos: [[mín, máx] por nível], cacho: [raio por nível],
   *      sobe (procura a luz), seg: [lados por nível] } → { casca: geometrias, cachos: [[centro, raio]] }
   */
  function galhada(hastes, o) {
    const casca = [], cachos = [], { rnd } = o, ult = o.comp.length - 1;
    const ramo = (p0, dir, len, r0, nivel) => {
      const p1 = p0.clone().addScaledVector(dir, len);
      const g = new THREE.CylinderGeometry(r0 * 0.66, r0, len, o.seg[nivel] || 4, 1, nivel > 0);
      g.translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(yAxis, dir)).translate(p0.x, p0.y, p0.z);
      casca.push(g);
      if (o.cacho[nivel]) {
        cachos.push([p1, o.cacho[nivel]]);
        if (nivel >= ult - 1) cachos.push([p0.clone().lerp(p1, 0.55), o.cacho[nivel] * 0.8]);
      }
      if (nivel === ult) return;
      const [a, b] = o.filhos[nivel];
      const n = a + Math.floor(rnd() * (b - a + 1));
      const giro0 = rnd() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const lider = o.lider && nivel === 0 && i === 0;
        const abre = lider ? 0.12 + rnd() * 0.15 : o.abre[nivel] + rnd() * 0.35;
        const az = giro0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
        // eixo perpendicular ao galho pai para abrir em volta dele
        const lado = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
        lado.addScaledVector(dir, -lado.dot(dir)).normalize();
        const nd = dir.clone().multiplyScalar(Math.cos(abre)).addScaledVector(lado, Math.sin(abre));
        nd.y += o.sobe;
        nd.normalize();
        const comp = o.comp[nivel + 1] * (0.8 + rnd() * 0.4) * (lider ? 0.9 : 1);
        const inicio = nivel === 0 ? p0.clone().lerp(p1, lider ? 1 : o.forquilha + rnd() * (1 - o.forquilha)) : p1;
        ramo(inicio, nd, comp, r0 * 0.6, nivel + 1);
      }
    };
    for (const h of hastes) ramo(h.p, h.dir, h.comp, h.raio, 0);
    return { casca, cachos };
  }
  /** Raminhos de folha em volta dos cachos → matrizes/cores num InstancedMesh (a partir de `k0`). */
  // V7: `tinta` [r, g, b] muda o tom da planta inteira; `mancha` (0–1) varia o tom em manchas dentro da copa
  function folhas(inst, k0, cachos, por, tam, rnd, aperto = 0.85, tom = 1, tinta = [1, 1, 1], mancha = 0) {
    const fase = (cachos[0][0].x * 7.1 + cachos[0][0].z * 3.3) % 6.28; // sem sortear: não muda o resto do mundo
    const centro = cachos.reduce((a, [p]) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / cachos.length);
    const yMin = Math.min(...cachos.map(([p]) => p.y)), yMax = Math.max(...cachos.map(([p]) => p.y));
    const raioMax = Math.max(0.01, ...cachos.map(([p]) => p.distanceTo(centro)));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), tw = new THREE.Quaternion(), c = new THREE.Color(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    let k = k0;
    for (const [pc, rc] of cachos) {
      for (let i = 0; i < por; i++) {
        v.set(rnd() * 2 - 1, rnd() * 1.6 - 0.6, rnd() * 2 - 1).normalize();
        const pos = pc.clone().addScaledVector(v, rc * (0.15 + rnd() * aperto));
        const fora = v.clone().multiplyScalar(0.6).add(pos.clone().sub(centro).normalize().multiplyScalar(0.8))
          .add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.3, rnd() - 0.5).multiplyScalar(0.6)).normalize();
        q.setFromUnitVectors(zAxis, fora);
        tw.setFromAxisAngle(fora, rnd() * Math.PI * 2);
        q.premultiply(tw);
        const sz = tam * (0.75 + rnd() * 0.5);
        inst.setMatrixAt(k, m4.compose(pos, q, sc.set(sz, sz, sz)));
        const alt = (pos.y - yMin) / Math.max(0.01, yMax - yMin), borda = Math.min(1, pos.distanceTo(centro) / raioMax);
        // manchas: faixas suaves de ruído no espaço (nunca perto de zero: 1 ± mancha/2)
        const nz = Math.sin(pos.x * 2.3 + fase) * Math.cos(pos.z * 1.9 - fase * 1.3) * 0.5 + Math.sin(pos.y * 3.1 + pos.x * 1.1 + fase) * 0.5;
        const luz = (0.42 + alt * 0.26 + borda * 0.28) * tom * (1 + nz * mancha * 0.5);
        inst.setColorAt(k, c.setRGB(luz * tinta[0] * (0.92 + rnd() * 0.14), luz * tinta[1] * (0.95 + rnd() * 0.1), luz * tinta[2] * (0.85 + rnd() * 0.15)));
        k++;
      }
    }
    return k;
  }
  const densidade = hi ? 1 : quality === 'medium' ? 0.6 : 0.35; // raminhos por cacho caem nos perfis mais leves
  // arbusto: 4–6 hastes saindo do chão, duas divisões; folhas bem junto dos ramos (nada solto em volta)
  const arbusto = (x, y, z, S, rnd) => {
    const hastes = [];
    const n = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(), inc = 0.25 + rnd() * 0.45;
      hastes.push({ p: new THREE.Vector3(x + Math.cos(a) * 0.06 * S, y, z + Math.sin(a) * 0.06 * S),
        dir: new THREE.Vector3(Math.cos(a) * Math.sin(inc), Math.cos(inc), Math.sin(a) * Math.sin(inc)), comp: 0.42 * S, raio: 0.025 * S });
    }
    return galhada(hastes, { rnd, comp: [0.42 * S, 0.3 * S, 0.2 * S], abre: [0.45, 0.4], filhos: [[2, 3], [2, 3]], cacho: [0, 0.2 * S, 0.17 * S],
      sobe: 0.25, seg: [5, 4, 3], forquilha: 0.6 });
  };
  // planta de vaso: hastes quase em pé e copa estreita — nada passa de `raio` em volta do vaso (paredes e vidros perto)
  const plantaDeVaso = (x, y, z, S, raio, rnd) => {
    const hastes = [];
    const n = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(), inc = 0.06 + rnd() * 0.16;
      hastes.push({ p: new THREE.Vector3(x + Math.cos(a) * 0.04 * S, y, z + Math.sin(a) * 0.04 * S),
        dir: new THREE.Vector3(Math.cos(a) * Math.sin(inc), Math.cos(inc), Math.sin(a) * Math.sin(inc)), comp: 0.5 * S, raio: 0.018 * S });
    }
    const g = galhada(hastes, { rnd, comp: [0.5 * S, 0.22 * S, 0.14 * S], abre: [0.3, 0.3], filhos: [[2, 3], [2, 2]], cacho: [0, 0.13 * S, 0.11 * S],
      sobe: 0.5, seg: [5, 4, 3], forquilha: 0.55 });
    // cachos puxados para dentro do raio (as folhas saem até ~0,7 do raio do cacho + metade do raminho)
    for (const c of g.cachos) {
      const dx = c[0].x - x, dz = c[0].z - z, d = Math.hypot(dx, dz), lim = Math.max(0.05, raio - c[1]);
      if (d > lim) { c[0].x = x + (dx / d) * lim; c[0].z = z + (dz / d) * lim; }
    }
    return g;
  };

  // vaso com terra e uma planta do mesmo gerador das árvores/arbustos (mesmas folhas do jardim)
  let vasoSeed = 41;
  function plant(parent, x, z, s = 1, y = FL) {
    cyl(parent, 0.22 * s, 0.17 * s, 0.45 * s, M.ceramic, x, y + 0.225 * s, z);
    cyl(parent, 0.2 * s, 0.2 * s, 0.02 * s, std({ color: 0x3b2a1c, roughness: 1 }), x, y + 0.43 * s, z, 20); // terra
    let sd = (vasoSeed += 97);
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const { casca, cachos } = plantaDeVaso(x, y + 0.44 * s, z, 1.25 * s, 0.32 * s, rnd);
    parent.add(shadowed(new THREE.Mesh(mergeGeometries(casca), M.bark)));
    const por = Math.max(6, Math.round(16 * densidade));
    const inst = shadowed(new THREE.InstancedMesh(cardGeo, sprigMats[vasoSeed % 3], cachos.length * por), true, true);
    folhas(inst, 0, cachos, por, 0.17 * s, rnd, 0.7, 0.8);
    parent.add(inst);
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
    sph(interior, 0.06, M.bulbCozinha, 0, SLAB0 - 1.18, -1.4);
    lightPool(0xffc88a, 0, FL + 0.78, -1.4, 0.5, 0.75, 0.3, 'cozinha'); // facho no tampo da mesa
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
      sph(interior, 0.045, M.bulbCozinha, x, SLAB0 - 1.41, -1.0);
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
      sph(interior, 0.04, M.bulbQuarto, x, UFL + 0.72, bz0 + 0.22);
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
  // piscina: poço de 1,3 m no furo do terreno, azulejo em metros, água mais transparente
  {
    const { x: px, z: pz, w: pw, d: pd, depth } = POOL;
    const top = 0.14, yF = 0.1 - depth, wallH = top - yF, wt = 0.05;
    const tileMap = M.tile.map.clone(); tileMap.repeat.set(1, 1); tileMap.needsUpdate = true;
    const wallMat = std({ map: tileMap, roughness: 0.25, color: 0xcfe7ec });
    const floorMat = std({ map: tileMap, roughness: 0.3, color: 0x8db9c4 }); // fundo mais escuro: lê como profundo
    tiledBox(root, pw, 0.04, pd, floorMat, px, yF - 0.02, pz);
    tiledBox(root, pw, wallH, wt, wallMat, px, yF + wallH / 2, pz - pd / 2 + wt / 2);
    tiledBox(root, pw, wallH, wt, wallMat, px, yF + wallH / 2, pz + pd / 2 - wt / 2);
    tiledBox(root, wt, wallH, pd - wt * 2, wallMat, px - pw / 2 + wt / 2, yF + wallH / 2, pz);
    tiledBox(root, wt, wallH, pd - wt * 2, wallMat, px + pw / 2 - wt / 2, yF + wallH / 2, pz);
    // borda de pedra maciça do chão (y 0) até 0,195: fecha a lateral externa da parede de azulejo,
    // que antes aparecia entre a grama e a borda; avança 4 cm sobre a água (pingadeira)
    const bh = 0.195, bw = 0.35, ov = 0.04, bwo = bw + ov;
    box(root, pw + bw * 2, bh, bwo, M.stone, px, bh / 2, pz - pd / 2 - bw / 2 + ov / 2);
    box(root, pw + bw * 2, bh, bwo, M.stone, px, bh / 2, pz + pd / 2 + bw / 2 - ov / 2);
    box(root, bwo, bh, pd - ov * 2, M.stone, px - pw / 2 - bw / 2 + ov / 2, bh / 2, pz);
    box(root, bwo, bh, pd - ov * 2, M.stone, px + pw / 2 + bw / 2 - ov / 2, bh / 2, pz);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(pw - wt * 2, pd - wt * 2), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(px, 0.1, pz);
    water.receiveShadow = true;
    root.add(water);
    // luminária na parede, meio metro abaixo da água, e o brilho dela no fundo
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.02), M.poolLight);
    pl.position.set(px, -0.45, pz - pd / 2 + wt + 0.011);
    root.add(pl);
    lightPool(0x46dcff, px, yF + 0.012, pz, pw * 0.5, pd * 0.55, 0.45, 'externa');
    // V2: cáusticas animadas no fundo — de dia pelo sol, à noite pela luminária (cômodo externa)
    const caus = new THREE.Mesh(new THREE.PlaneGeometry(pw - wt * 2, pd - wt * 2), causticMat);
    caus.rotation.x = -Math.PI / 2; caus.position.set(px, yF + 0.02, pz); caus.renderOrder = 2; caus.userData.semAO = true;
    root.add(caus);
    // V2: brilho subaquático ciano — as paredes clareiam de baixo para cima
    glowBatch(washTex, 0x46dcff, [
      { w: pw - wt * 2, h: wallH, x: px, y: yF + wallH / 2, z: pz - pd / 2 + wt + 0.01 },
      { w: pw - wt * 2, h: wallH, x: px, y: yF + wallH / 2, z: pz + pd / 2 - wt - 0.01 },
      { w: pd - wt * 2, h: wallH, x: px - pw / 2 + wt + 0.01, y: yF + wallH / 2, z: pz, ry: Math.PI / 2 },
      { w: pd - wt * 2, h: wallH, x: px + pw / 2 - wt - 0.01, y: yF + wallH / 2, z: pz, ry: Math.PI / 2 },
    ], 0.35);
    // escada de aço na ponta leste: dá a escala da profundidade
    {
      const lx = px + pw / 2 - wt - 0.1, ox = px + pw / 2 + 0.25;
      for (const dz of [-0.25, 0.25]) {
        const z = pz + dz;
        cyl(root, 0.02, 0.02, 1.75, M.steel, lx, -0.025, z, 10);                      // desce na água
        const h = cyl(root, 0.02, 0.02, ox - lx, M.steel, (lx + ox) / 2, 0.85, z, 10); // passa sobre a borda
        h.rotation.z = Math.PI / 2;
        cyl(root, 0.02, 0.02, 0.66, M.steel, ox, 0.52, z, 10);                          // fixa na pedra
      }
      for (const y of [-0.75, -0.45, -0.15]) box(root, 0.08, 0.025, 0.5, M.steel, lx - 0.02, y, pz);
    }
    // espreguiçadeiras no gramado a oeste da piscina, pés voltados para a água, 40 cm da borda de pedra
    // (ao sul não cabem: entre a borda e o fim do terreno sobram só 1,25 m)
    const lx = POOL.x - POOL.w / 2 - 0.35 - 0.4 - 0.9;
    for (const dz of [-0.55, 0.55]) lounger(root, lx, 0, POOL.z + dz, Math.PI / 2);
  }
  // caminho de pedras até a porta + calçada da garagem
  // assentadas rente à grama (topo a 2,5 cm); a primeira começa onde termina o patamar da porta (z = 4,125)
  for (let i = 0; i < 9; i++) tiledBox(root, 1.5, 0.06, 0.55, M.pathTile, 3.0, 0.025 - 0.03, 4.4 + i * 0.85);
  // piso da garagem e calçada numa laje só (antes eram duas caixas com textura esticada diferente e um degrau),
  // com a textura em metros e juntas de dilatação a cada 2,5 m
  {
    const x0 = 6.3, x1 = GAR_X1, z0 = -3.8, z1 = 11.75;
    // bloco de concreto fotográfico (Poly Haven concrete_pavement, CC0): a textura cobre 1,8 m e já traz as juntas
    // concreto liso fotográfico (Poly Haven concrete_floor_worn_001, CC0): a foto cobre 3 m
    const piso = std({ ...TX.photoMaps('concrete_floor_worn_001', { repeat: [1 / 3, 1 / 3], leve: quality === 'low' }), roughness: 1 });
    // embutido: o topo fica 1 cm acima da grama (antes era uma placa de 6 cm por cima do terreno)
    tiledBox(root, x1 - x0, 0.06, z1 - z0, piso, (x0 + x1) / 2, PISO_TOPO - 0.03, (z0 + z1) / 2);
    // meio-fio fino de concreto nas bordas que dão para o jardim: leste, oeste (depois da casa) e fundos;
    // a frente (z = 11,75) é a saída para a rua e fica sem
    const fio = std({ color: 0xa9a7a1, roughness: 0.9 });
    const fw = 0.12, fh = 0.03;
    box(root, fw, fh, z1 - z0 + fw, fio, x1 + fw / 2, PISO_TOPO - 0.03 + fh / 2 + 0.015, (z0 + z1) / 2 - fw / 2, { cast: false });
    box(root, x1 - x0 + fw, fh, fw, fio, (x0 + x1) / 2 + fw / 2, PISO_TOPO - 0.03 + fh / 2 + 0.015, z0 - fw / 2, { cast: false });
    // lado oeste (jardim e caminho): da fachada sul da casa (z = 3,8) até o fim da laje
    box(root, fw, fh, z1 - 3.8, fio, x0 - fw / 2, PISO_TOPO - 0.03 + fh / 2 + 0.015, (3.8 + z1) / 2, { cast: false });
  }
  // balizadores (luz de jardim)
  const bollards = [];
  for (const [x, z] of [[1.9, 5.6], [4.1, 5.6], [1.9, 8.2], [4.1, 8.2], [1.9, 10.8], [4.1, 10.8]]) {
    cyl(root, 0.06, 0.07, 0.6, M.frame, x, 0.3, z, 16);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16), M.bollard);
    head.position.set(x, 0.55, z);
    root.add(head);
    bollards.push(head);
  }
  // V2: halo em volta da cabeça e círculo de luz no chão de cada balizador
  {
    const B = [[1.9, 5.6], [4.1, 5.6], [1.9, 8.2], [4.1, 8.2], [1.9, 10.8], [4.1, 10.8]];
    halos(0xffc98a, B.map(([x, z]) => [x, 0.56, z, 0.55]), 0.55);
    glowBatch(poolTex, 0xffc27a, B.map(([x, z]) => ({ w: 1.3, h: 1.3, x, y: 0.015, z, chao: true })), 0.5);
  }
  // V2: luz rasante na fachada da entrada (régua no pé da parede, brilho subindo; o vão da porta fica de fora)
  {
    const zf = 3.625 + 0.012, hw = 2.6;
    const faixas = [[1.5, 2.4], [3.6, 6.0]];
    glowBatch(washTex, 0xffc89a, faixas.map(([a, b]) => ({ w: b - a, h: hw, x: (a + b) / 2, y: FL + hw / 2, z: zf })), 0.55);
    for (const [a, b] of faixas) box(root, b - a - 0.1, 0.035, 0.05, M.uplight, (a + b) / 2, FL + 0.02, zf + 0.02, { cast: false });
  }
  // V2: fita de LED sob a borda do deck (sul e oeste) e o brilho dela na grama
  {
    const x0 = -6.6, x1 = 1.8, z0 = 3.9, z1 = 6.8, y = 0.045;
    box(root, x1 - x0, 0.015, 0.015, M.uplight, (x0 + x1) / 2, y, z1 + 0.005, { cast: false });
    box(root, 0.015, 0.015, z1 - z0, M.uplight, x0 - 0.005, y, (z0 + z1) / 2, { cast: false });
    glowBatch(washTex, 0xffc27a, [
      { w: x1 - x0, h: 0.5, x: (x0 + x1) / 2, y: 0.012, z: z1 + 0.25, chao: true, inv: true },
      { w: z1 - z0, h: 0.5, x: x0 - 0.25, y: 0.012, z: (z0 + z1) / 2, chao: true, inv: true, ry: Math.PI / 2 },
    ], 0.6);
  }

  // carro elétrico — entra de frente na garagem; a posição vem do HC-SR04 (V12)
  const car = new THREE.Group();
  car.userData.dynamic = true;
  const carWheels = [];
  const carHeadMat = std({ color: 0xffffff, emissive: 0xdfefff, emissiveIntensity: 0.25 });
  const carTailMat = std({ color: 0x550000, emissive: 0xff2030, emissiveIntensity: 0.8 });
  // V3: LED do wallbox e da porta de carga (cor = estado do carregador, ver update())
  const evLedMat = std({ color: 0x222222, emissive: 0x5ee7ff, emissiveIntensity: 0 });
  const evPortMat = std({ color: 0x1a1d22, emissive: 0x36e39a, emissiveIntensity: 0 });
  let evCablePlug = null, evCableHolster = null;
  const carGerado = new THREE.Group(); // carro gerado em código (some se houver modelos/carro.glb)
  {
    car.position.set(CARRO_X, PISO_TOPO - 0.01, 7.4);   // no meio da vaga (parede x = 6,3, pilares x = GAR_X1 − 0,2)
    car.scale.setScalar(0.88);
    car.rotation.y = Math.PI; // frente (faróis, +z local) virada para o fundo da garagem
    // Carro elétrico moderno (sedã fastback). Frente = +z local, comprimento ±2,27, largura 1,8.
    // Carroceria: perfil lateral em curvas, extrudado com chanfro largo e depois deformado — arredondada em planta
    // (frente e traseira afinam), lateral cheia na cintura e recolhida embaixo; estufa de vidro (teto panorâmico)
    // mais estreita em cima. Pintura com verniz (clearcoat), para-lamas e soleiras pretos, frisos das portas,
    // maçanetas embutidas, retrovisores, barras de luz de ponta a ponta e rodas aerodinâmicas.
    const deforma = (g, { cintura = 0.62, estufa = false } = {}) => {
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        let x = pos.getX(k);
        const y = pos.getY(k), z = pos.getZ(k);
        const t = THREE.MathUtils.clamp((Math.abs(z) - 1.6) / 0.7, 0, 1);
        x *= 1 - 0.11 * t * t;                                                    // planta arredondada
        if (estufa) x *= 1 - 0.3 * THREE.MathUtils.clamp((y - 0.9) / 0.55, 0, 1); // vidros inclinados para dentro
        else x *= 1 - 0.08 * Math.min(1, ((y - cintura) / 0.4) ** 2);            // lateral cheia na cintura
        pos.setX(k, x);
      }
      // normais suaves: a extrusão vem sem índice (cada face com a sua normal = facetas)
      g.deleteAttribute('normal');
      g = mergeVertices(g);
      g.computeVertexNormals();
      return g;
    };
    const extrude = (shape, width, bevel, mat, opts) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 24 });
      g.rotateY(-Math.PI / 2);                  // comprimento do perfil → eixo z do carro
      g.translate((width - bevel * 2) / 2 + (opts?.dx || 0), 0, 0); // dx: painel deslocado para um lado (portas)
      const m = shadowed(new THREE.Mesh(deforma(g, opts), mat));
      car.add(m);
      return m;
    };
    const ARCH = 0.45, RODAS = [1.4, -1.45];
    let corpo;
    // corpo até a linha de cintura: para-choque traseiro, tampa curta, cintura subindo para trás, capô baixo
    {
      const sh = new THREE.Shape();
      sh.moveTo(-2.16, 0.32);
      sh.quadraticCurveTo(-2.27, 0.36, -2.27, 0.5);                    // traseira reta (Kamm), cantos arredondados
      sh.lineTo(-2.26, 0.84);
      sh.quadraticCurveTo(-2.24, 0.97, -2.0, 0.98);                    // borda da tampa (spoiler embutido)
      // habitáculo aberto entre a tampa e o para-brisa (o corpo desce até o assoalho; as portas vêm abaixo)
      sh.lineTo(-1.66, 0.975);
      sh.lineTo(-1.6, 0.5);
      sh.lineTo(0.92, 0.5);
      sh.lineTo(1.0, 0.9);                                             // base do para-brisa
      sh.bezierCurveTo(1.5, 0.87, 1.95, 0.8, 2.15, 0.7);               // capô baixo
      sh.bezierCurveTo(2.3, 0.62, 2.3, 0.42, 2.2, 0.32);               // bico arredondado
      for (const cx of [...RODAS].sort((a, b) => b - a)) {             // linha de baixo, da frente para trás, com as caixas de roda
        sh.lineTo(cx + ARCH, 0.32);
        sh.absarc(cx, 0.34, ARCH, 0, Math.PI, false);
      }
      sh.lineTo(-2.16, 0.32);
      corpo = extrude(sh, 1.8, 0.1, M.carPaint);
      // portas: painéis laterais da cintura até o assoalho, dos dois lados do habitáculo
      const porta = new THREE.Shape();
      porta.moveTo(-1.64, 0.45); porta.lineTo(-1.64, 0.975); porta.lineTo(0.96, 0.9); porta.lineTo(0.96, 0.45); porta.closePath();
      for (const sx of [-1, 1]) extrude(porta, 0.12, 0.03, M.carPaint, { dx: sx * 0.84 });
    }
    // o chanfro engorda o contorno: frente/traseira de verdade vêm da caixa da malha (detalhes encostam nela)
    corpo.geometry.computeBoundingBox();
    const zT = corpo.geometry.boundingBox.min.z, zF = corpo.geometry.boundingBox.max.z;
    // estufa de vidro: para-brisa bem inclinado, teto panorâmico e caimento fastback até a tampa
    {
      const c = new THREE.Shape();
      c.moveTo(1.02, 0.88);
      c.bezierCurveTo(0.6, 1.12, 0.3, 1.38, 0.0, 1.42);
      c.bezierCurveTo(-0.6, 1.47, -1.15, 1.4, -1.55, 1.18);
      c.quadraticCurveTo(-1.8, 1.04, -1.92, 0.95);
      c.lineTo(1.02, 0.88);
      // vidro transparente (dá para ver o interior), com reflexo e verniz
      const vidro = new THREE.MeshPhysicalMaterial({ color: 0x030405, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.74, side: THREE.DoubleSide, specularIntensity: 0.25, ior: 1.2,
        envMapIntensity: 0.4, depthWrite: false });
      const est = extrude(c, 1.62, 0.1, vidro, { estufa: true });
      est.castShadow = false;
      est.renderOrder = 2;
    }
    // interior visto pelos vidros: assoalho, bancos, painel, tela central e volante (motorista à esquerda = +x)
    {
      const banco = std({ color: 0x2a2d31, roughness: 0.85 });
      const acab = std({ color: 0xd8d2c6, roughness: 0.7 });
      box(car, 1.45, 0.06, 2.6, banco, 0, 0.62, -0.25, { cast: false });                 // assoalho
      for (const [x, z] of [[0.38, 0.05], [-0.38, 0.05]]) {
        box(car, 0.5, 0.12, 0.5, banco, x, 0.72, z, { round: 0.05, cast: false });       // assento
        const enc = box(car, 0.48, 0.6, 0.12, banco, x, 1.02, z - 0.3, { round: 0.05, cast: false });
        enc.rotation.x = -0.22;
        box(car, 0.24, 0.12, 0.08, banco, x, 1.38, z - 0.38, { round: 0.03, cast: false }); // encosto de cabeça
      }
      box(car, 1.3, 0.12, 0.45, banco, 0, 0.74, -0.95, { round: 0.05, cast: false });    // banco traseiro
      const encT = box(car, 1.3, 0.5, 0.12, banco, 0, 1.0, -1.2, { round: 0.05, cast: false });
      encT.rotation.x = -0.28;
      box(car, 1.4, 0.16, 0.3, banco, 0, 0.94, 0.78, { round: 0.04, cast: false });      // painel
      box(car, 1.36, 0.025, 0.04, acab, 0, 0.99, 0.64, { cast: false });                 // friso claro do painel
      const tela = box(car, 0.34, 0.22, 0.02, std({ color: 0x0b1118, emissive: 0x3a7bd5, emissiveIntensity: 0.35, roughness: 0.2 }), 0, 1.1, 0.62, { cast: false });
      tela.rotation.x = -0.25;
      const volante = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 24), banco);
      volante.position.set(0.38, 1.02, 0.52); volante.rotation.x = -0.45;
      car.add(volante);
      box(car, 0.2, 0.06, 0.4, banco, 0, 0.78, 0.25, { round: 0.03, cast: false });     // console central
    }
    const preto = std({ color: 0x15171a, roughness: 0.75 });
    const brilho = std({ color: 0x0c0d0f, roughness: 0.25, metalness: 0.3 });
    for (const sx of [-1, 1]) {
      // soleira preta entre as rodas e molduras das caixas de roda
      box(car, 0.05, 0.1, 1.9, preto, sx * 0.86, 0.36, -0.03, { cast: false, round: 0.02 });
      for (const cz of RODAS) {
        const arco = new THREE.Mesh(new THREE.TorusGeometry(ARCH + 0.02, 0.035, 6, 20, Math.PI), preto);
        arco.rotation.y = sx * Math.PI / 2;
        arco.position.set(sx * 0.82, 0.34, cz);
        car.add(arco);
      }
      // frisos das portas (dianteira/traseira) e maçanetas embutidas
      for (const z of [0.98, -0.25, -1.3]) box(car, 0.012, 0.46, 0.012, brilho, sx * 0.875, 0.68, z, { cast: false });
      for (const z of [0.45, -0.75]) box(car, 0.012, 0.025, 0.2, M.steel, sx * 0.88, 0.84, z, { cast: false });
      // retrovisor tipo câmera
      box(car, 0.1, 0.03, 0.05, brilho, sx * 0.86, 0.96, 0.82, { cast: false });
      box(car, 0.07, 0.08, 0.16, M.carPaint, sx * 0.94, 0.98, 0.82, { round: 0.03 });
    }
    // frente lisa (sem grade): entrada de ar baixa preta e sensor; traseira com difusor
    box(car, 1.2, 0.1, 0.1, brilho, 0, 0.42, zF - 0.06, { round: 0.04, cast: false });  // entrada de ar
    box(car, 1.3, 0.12, 0.08, preto, 0, 0.4, zT + 0.02, { round: 0.03, cast: false });   // difusor
    box(car, 0.36, 0.11, 0.02, M.whitePlastic, 0, 0.6, zT - 0.008, { cast: false });       // placa
    box(car, 1.5, 0.1, 0.02, brilho, 0, 0.86, zT + 0.002, { cast: false });               // faixa preta da lanterna
    for (const cz of RODAS) {
      for (const sx of [-0.8, 0.8]) {
        // roda num grupo próprio para girar conforme o carro anda: pneu com flanco arredondado, aro e tampa aerodinâmica
        const wg = new THREE.Group();
        wg.position.set(sx, 0.36, cz);
        car.add(wg);
        const pneu = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.095, 12, 36), M.rubber));
        pneu.rotation.y = Math.PI / 2;
        wg.add(pneu);
        const aro = cyl(wg, 0.27, 0.27, 0.2, M.steel, 0, 0, 0, 36);
        aro.rotation.z = Math.PI / 2;
        const tampa = cyl(wg, 0.24, 0.24, 0.205, M.frame, 0, 0, 0, 36); // face escura (aero)
        tampa.rotation.z = Math.PI / 2;
        for (let k = 0; k < 5; k++) { // raios claros sobre a tampa: deixam a rotação visível
          const sp = box(wg, 0.215, 0.05, 0.03, M.steel, Math.sign(sx) * 0.006, 0, 0, { cast: false });
          sp.position.y = 0; sp.rotation.x = (k / 5) * Math.PI;
        }
        const cubo = cyl(wg, 0.05, 0.05, 0.22, brilho, 0, 0, 0, 16);
        cubo.rotation.z = Math.PI / 2;
        carWheels.push(wg);
      }
    }
    // barras de luz de ponta a ponta (frente e traseira)
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, 0.03), carHeadMat);
    head.position.set(0, 0.63, zF - 0.035); car.add(head);
    for (const sx of [-1, 1]) {
      const farol = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.03), carHeadMat);
      farol.position.set(sx * 0.6, 0.6, zF - 0.06); farol.rotation.y = sx * -0.35; car.add(farol);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.04, 0.02), carTailMat);
    tail.position.set(0, 0.87, zT - 0.01); car.add(tail);
    for (const sx of [-1, 1]) { // lanternas que dobram para a lateral
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.22), carTailMat);
      l.position.set(sx * 0.76, 0.87, zT + 0.12); l.rotation.y = sx * 0.5; car.add(l);
    }
    // V3: a porta de carga (para-lama dianteiro, lado da parede) é criada logo abaixo, fora do carro gerado
    // tudo o que foi montado até aqui é o carro gerado; a porta de carga fica fora (vale para os dois)
    for (const c of [...car.children]) carGerado.add(c);
    car.add(carGerado);
    box(car, 0.03, 0.09, 0.13, evPortMat, 0.865, 0.6, 1.98, { cast: false });
    root.add(car);
    if (MODELOS.carro) carregarCarro();
  }
  // V3: modelo 3D de um carro de verdade (glTF binário em public/modelos/*.glb), se existir — ver README.
  // O servidor diz qual usar (MODELOS.carro, CARRO_MODELO no .env); ?carro=nome troca na hora, ?carroGiro=180 vira a frente.
  // Ajustes automáticos: comprimento igual ao do carro gerado, centralizado, rodas no chão; vidros com "transmission"
  // (renderiza a cena 2×, armadilha nº 5) viram vidro preto translúcido nas janelas e lente clara nos faróis/lanternas;
  // peças de roda que vêm com as 4 rodas numa malha só são divididas por quadrante, cada roda no seu eixo.
  const RODA = /(^|[_\s.])(rim|rims|wheel|wheels|tyre|tire|pneu|roda|disk|alloy)([_\s.]|$)/i;
  function carregarCarro() {
    const q = new URLSearchParams(location.search);
    const nome = MODELOS.carros?.includes(q.get('carro')) ? q.get('carro') : MODELOS.carro;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loader.load(`/modelos/${encodeURIComponent(nome)}.glb`, (gltf) => {
      const m = gltf.scene;
      const giro = Number(q.get('carroGiro')) || 0;
      let caixa = new THREE.Box3().setFromObject(m), tam = caixa.getSize(new THREE.Vector3());
      if (tam.x > tam.z) m.rotation.y = Math.PI / 2;  // comprimento no eixo z do carro
      m.rotation.y += THREE.MathUtils.degToRad(giro);
      m.updateMatrixWorld(true);
      caixa = new THREE.Box3().setFromObject(m); tam = caixa.getSize(new THREE.Vector3());
      m.scale.multiplyScalar(4.54 / tam.z);
      m.updateMatrixWorld(true);
      caixa = new THREE.Box3().setFromObject(m);
      const centro = caixa.getCenter(new THREE.Vector3());
      m.position.sub(new THREE.Vector3(centro.x, caixa.min.y, centro.z));
      car.add(m);
      car.updateMatrixWorld(true);

      // materiais: vidro preto nas janelas, lente clara nas luzes, nada de transmission
      const vidro = new THREE.MeshPhysicalMaterial({ color: 0x030405, roughness: 0.05, transparent: true, opacity: 0.74, side: THREE.DoubleSide,
        specularIntensity: 0.25, ior: 1.2, envMapIntensity: 0.4, depthWrite: false });
      const lente = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.18, specularIntensity: 0.6,
        envMapIntensity: 0.8, depthWrite: false });
      const rodas = [];
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        const mt = o.material, nome = `${o.name} ${mt.name || ''}`.toLowerCase();
        const decalque = /tex|defog|defoo|sticker|badge|mirror/.test(nome);
        const transparente = mt.transmission > 0 || (mt.transparent && mt.opacity < 0.95);
        if (transparente && !decalque) {
          o.material = /light|lamp|hl|ind|tail|outer|reflector|projector|lens/.test(nome) ? lente : vidro;
          o.castShadow = false; o.renderOrder = 2;
        } else if (mt.transmission > 0) mt.transmission = 0;
        if (RODA.test(o.name)) rodas.push(o);
      });

      // rodas: cada malha de roda dividida em 4 (pelo centro de cada triângulo), cada parte no pivô do seu eixo
      const inv = car.matrixWorld.clone().invert();
      const partes = [[], [], [], []], caixas = [0, 1, 2, 3].map(() => new THREE.Box3());
      for (const o of rodas) {
        // modelos comprimidos (meshopt) guardam posição/normal em inteiros normalizados (−1..1): em float antes de
        // levar para as coordenadas do carro, senão os valores passam de 1 e são cortados (roda deformada)
        const g = new THREE.BufferGeometry();
        for (const [n, at] of Object.entries(o.geometry.attributes)) {
          const f = new Float32Array(at.count * at.itemSize);
          for (let v = 0; v < at.count; v++) for (let c = 0; c < at.itemSize; c++) f[v * at.itemSize + c] = at.getComponent(v, c);
          g.setAttribute(n, new THREE.BufferAttribute(f, at.itemSize));
        }
        if (o.geometry.index) g.setIndex(Array.from(o.geometry.index.array));
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        const pos = g.attributes.position, ix = g.index ? g.index.array : null;
        const nTri = (ix ? ix.length : pos.count) / 3, listas = [[], [], [], []];
        for (let t = 0; t < nTri; t++) {
          const a = ix ? ix[t * 3] : t * 3, b = ix ? ix[t * 3 + 1] : t * 3 + 1, c = ix ? ix[t * 3 + 2] : t * 3 + 2;
          const cx = pos.getX(a) + pos.getX(b) + pos.getX(c), cz = pos.getZ(a) + pos.getZ(b) + pos.getZ(c);
          listas[(cx > 0 ? 1 : 0) + (cz > 0 ? 2 : 0)].push(a, b, c);
        }
        listas.forEach((l, qd) => {
          if (!l.length) return;
          const sub = new THREE.BufferGeometry();
          for (const [n, at] of Object.entries(g.attributes)) sub.setAttribute(n, at);
          sub.setIndex(l);
          // caixa só com os vértices desta roda (computeBoundingBox mediria o buffer inteiro, compartilhado pelas 4)
          for (const v of l) caixas[qd].expandByPoint(new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v)));
          const mesh = new THREE.Mesh(sub, o.material);
          mesh.castShadow = true; mesh.receiveShadow = true;
          partes[qd].push(mesh);
        });
        o.parent.remove(o);
      }
      const pivos = [];
      partes.forEach((ms, qd) => {
        if (!ms.length) return;
        const c = caixas[qd].getCenter(new THREE.Vector3());
        const pivo = new THREE.Group();
        pivo.position.copy(c);
        for (const mesh of ms) { mesh.position.copy(c).negate(); pivo.add(mesh); }
        car.add(pivo);
        pivos.push(pivo);
      });

      carGerado.visible = false;
      carWheels.length = 0;
      carWheels.push(...pivos);
      S.atualizaSombra = 3; // sombra nova com o modelo (main.js atualiza enquanto S.moving)
      // crédito do modelo (licenças CC-BY pedem atribuição): vem do próprio arquivo (asset.extras do Sketchfab)
      const ex = gltf.asset?.extras || {};
      S.creditoCarro = ex.title ? { titulo: ex.title, autor: String(ex.author || '').replace(/\s*\(.*\)$/, ''), licenca: String(ex.license || '').replace(/\s*\(.*\)$/, ''), fonte: ex.source || '' } : null;
      console.log(`[casa3d] modelo do carro: ${nome} (${pivos.length} rodas)${S.creditoCarro ? ` — ${S.creditoCarro.titulo} por ${S.creditoCarro.autor}, ${S.creditoCarro.licenca}` : ''}`);
      onCreditoCarro?.(S.creditoCarro);
    }, undefined, (e) => console.warn(`[casa3d] modelo do carro não carregou, usando o gerado: ${e.message || e}`));
  }


  // V3: carregador do carro elétrico (wallbox) na parede leste, ao lado da vaga. Virtual: vem de state.carro.
  // Tela com a % da bateria (canvas redesenhado só quando muda) e barra de LED; cabo ligado no carro
  // quando ele está na vaga, enrolado no suporte quando não está. Sem luzes novas (tudo emissivo).
  const evScreenCanvas = document.createElement('canvas');
  evScreenCanvas.width = 256; evScreenCanvas.height = 128;
  const evScreenTex = new THREE.CanvasTexture(evScreenCanvas);
  evScreenTex.colorSpace = THREE.SRGBColorSpace;
  let evSig = '';
  function drawEvScreen(c) {
    const pct = c ? Math.floor(c.bateria) : null;
    const st = !c ? '--' : !c.naGaragem ? 'SEM CARRO' : c.carregando ? `${String(c.kW).replace('.', ',')} kW` : c.aguardando ? 'FORA DE PONTA' : c.ligado && pct >= 100 ? 'COMPLETA' : 'PRONTO';
    const sig = `${pct}|${st}`;
    if (sig === evSig) return;
    evSig = sig;
    const g = evScreenCanvas.getContext('2d'), W = 256, Hh = 128;
    g.fillStyle = '#05080d'; g.fillRect(0, 0, W, Hh);
    const cor = c?.carregando ? '#36e39a' : c?.aguardando ? '#ffc27a' : '#5ee7ff';
    g.fillStyle = cor; g.font = '700 58px "DM Sans", sans-serif'; g.textAlign = 'center';
    g.fillText(pct === null ? '--' : `${pct}%`, W / 2, 66);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.strokeRect(28, 80, W - 56, 14);
    g.fillRect(31, 83, (W - 62) * ((pct ?? 0) / 100), 8);
    g.fillStyle = '#9fb4cc'; g.font = '600 20px "DM Sans", sans-serif'; g.fillText(st, W / 2, 118);
    evScreenTex.needsUpdate = true;
  }
  {
    const x0 = 6.0 + T / 2, zc = 2.25, yc = FL + 1.05;
    box(root, 0.12, 0.44, 0.32, M.whitePlastic, x0 + 0.06, yc, zc, { round: 0.04 });
    box(root, 0.02, 0.36, 0.24, M.frame, x0 + 0.125, yc + 0.01, zc, { round: 0.008, cast: false });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), std({ color: 0x000000, emissive: 0xffffff, emissiveMap: evScreenTex, emissiveIntensity: 0.9 }));
    scr.position.set(x0 + 0.137, yc + 0.07, zc); scr.rotation.y = Math.PI / 2;
    root.add(scr);
    box(root, 0.012, 0.025, 0.16, evLedMat, x0 + 0.137, yc - 0.06, zc, { cast: false }); // barra de LED de status
    box(root, 0.05, 0.05, 0.06, M.frame, x0 + 0.03, yc - 0.3, zc + 0.24); // suporte do conector
    anchor('carregador', x0 + 0.1, yc + 0.4, zc);
    // cabo: dois traçados fixos; liga um ou outro (sem recriar geometria a cada quadro)
    const tubo = (pts) => {
      const g = new THREE.Group(); g.userData.dynamic = true;
      g.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, 0.017, 8), M.black), true, false));
      root.add(g);
      return g;
    };
    const px = CARRO_X - 0.865 * 0.88; // porta de carga do carro na vaga
    // o embasamento da casa vai até x = 6,3 com topo em FL (15 cm): o cabo se afasta da parede ainda no alto e só
    // desce no piso da garagem, longe do embasamento (topo do piso a 1,2 cm; o tubo tem 1,7 cm de raio)
    evCablePlug = tubo([[x0 + 0.06, yc - 0.22, zc], [x0 + 0.2, yc - 0.55, zc - 0.04], [6.5, 0.32, 2.12], [6.58, 0.032, 2.04], [(6.58 + px) / 2, 0.032, 1.94], [px - 0.06, 0.2, 1.84], [px - 0.01, 0.52, 1.81]]);
    evCableHolster = tubo([[x0 + 0.06, yc - 0.22, zc], [x0 + 0.08, 0.55, zc + 0.05], [x0 + 0.09, 0.38, zc + 0.2], [x0 + 0.06, yc - 0.33, zc + 0.24]]);
  }

  // árvores: tronco com líder, 3–5 galhos principais, 2 divisões; a árvore inteira balança em torno do pé
  const trees = [];
  // V7: cada árvore tem o seu jeito — tom (tinta), tamanho da folha, quantidade de enchimento, desenho da folha e manchas
  const ARV_VAR = [
    { tinta: [1, 1, 1], folha: 1, enche: 1, mat: 0, mancha: 0.5 },
    { tinta: [1.12, 1.04, 0.78], folha: 0.9, enche: 1.1, mat: 2, mancha: 0.7 },   // verde-amarelada, folha miúda
    { tinta: [0.86, 0.97, 0.92], folha: 1.2, enche: 0.9, mat: 1, mancha: 0.4 },   // mais escura, folha grande
    { tinta: [1.05, 1.0, 0.85], folha: 1, enche: 1.2, mat: 0, mancha: 0.6 },
    { tinta: [0.92, 1.06, 0.95], folha: 1.1, enche: 1, mat: 2, mancha: 0.5 },
    { tinta: [1.1, 1.02, 0.82], folha: 0.95, enche: 1.15, mat: 1, mancha: 0.8 },
    { tinta: [0.88, 1.0, 0.9], folha: 1.15, enche: 0.95, mat: 0, mancha: 0.45 },
    { tinta: [1.0, 1.08, 0.88], folha: 1.0, enche: 1.1, mat: 2, mancha: 0.6 },
  ];
  function tree(x, z, s = 1, seed = 1) {
    const v = ARV_VAR[(seed - 1) % ARV_VAR.length];
    let sd = seed * 7919 + 13;
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const crown = new THREE.Group();
    crown.userData.dynamic = true;
    crown.position.set(x, 0, z);
    const incl = new THREE.Vector3((rnd() - 0.5) * 0.12, 1, (rnd() - 0.5) * 0.12).normalize();
    const { casca, cachos } = galhada([{ p: new THREE.Vector3(0, -0.05, 0), dir: incl, comp: 2.1 * s, raio: 0.2 * s }], {
      rnd, lider: true, comp: [2.1 * s, 1.35 * s, 0.85 * s, 0.55 * s], abre: [0.6, 0.45, 0.45], filhos: [[3, 5], [2, 3], [2, 3]],
      cacho: [0, 0, 0.8 * s, 0.62 * s], sobe: 0.22, seg: [12, 8, 5, 4], forquilha: 0.82,
    });
    crown.add(shadowed(new THREE.Mesh(mergeGeometries(casca), M.bark)));
    // V7: enchimento do miolo. Os cachos acima ficam só nas pontas dos galhos (a copa vira uma casca oca, vista de cima
    // aparecem buracos); aqui entram cachos dentro de uma elipse que cobre a copa, mais densos no topo
    {
      const min = new THREE.Vector3(1e9, 1e9, 1e9), max = new THREE.Vector3(-1e9, -1e9, -1e9);
      for (const [p] of cachos) { min.min(p); max.max(p); }
      const c0 = min.clone().add(max).multiplyScalar(0.5), rx = (max.x - min.x) / 2, ry = (max.y - min.y) / 2, rz = (max.z - min.z) / 2;
      const extra = Math.round(cachos.length * 0.9 * v.enche);
      for (let i = 0; i < extra; i++) {
        const d = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 0.55, rnd() * 2 - 1);
        if (d.length() > 1) { i--; continue; }
        cachos.push([new THREE.Vector3(c0.x + d.x * rx * 0.92, c0.y + d.y * ry * 0.95, c0.z + d.z * rz * 0.92), (0.55 + rnd() * 0.25) * s]);
      }
    }
    const por = Math.max(14, Math.round(46 * densidade));
    const inst = shadowed(new THREE.InstancedMesh(cardGeo, sprigMats[v.mat], cachos.length * por), true, true);
    folhas(inst, 0, cachos, por, 0.58 * s * v.folha, rnd, 0.85, 1, v.tinta, v.mancha);
    crown.add(inst);
    root.add(crown);
    trees.push({ crown, phase: seed * 1.7 });
  }
  const ARVORES = [[-12.2, -7.0, 1.15], [-13.0, 2.8, 0.95], [12.6, -8.2, 1.2], [14.0, -2.5, 1.0], [-11.6, 9.6, 0.85], [5.0, -9.9, 0.95], [-2.0, -9.6, 1.05], [14.2, 9.6, 0.7]];
  ARVORES.forEach(([x, z, s], i) => tree(x, z, s, i + 1));
  // V2: spot de chão em cada árvore — luminária no pé e círculo de luz (o halo da copa saiu: com a copa de galhos
  // ele ficava em volta do tronco)
  {
    for (const [x, z] of ARVORES) cyl(root, 0.07, 0.08, 0.06, M.uplight, x + 0.45, 0.03, z + 0.45, 12);
    glowBatch(poolTex, 0xffc27a, ARVORES.map(([x, z, s]) => ({ w: 1.8 * s, h: 1.8 * s, x: x + 0.2, y: 0.015, z: z + 0.2, chao: true })), 0.45);
  }

  // sebes e arbustos: arbustos de verdade (hastes + folhas), uma malha de casca e um InstancedMesh para todos
  {
    const spots = [];
    for (let x = -14; x <= 14; x += 0.9) spots.push([x, -10.9, 0.62 + Math.sin(x * 1.3) * 0.12]);
    for (let z = -9; z <= 7; z += 0.95) spots.push([-14.8, z, 0.6 + Math.cos(z) * 0.1]);
    for (const [x, z] of [[-7.3, 4.4], [-7.3, 6.8], [5.85, 4.3], [1.1, 7.75], [10.8, 3.6], [10.9, -1.2], [10.8, -3.4], [-7.2, -2.0], [-7.0, 0.5]]) spots.push([x, z, 0.5 + Math.abs((x * z) % 0.25)]);
    let sd = 4242;
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const todos = spots.map(([x, z, S]) => arbusto(x, 0, z, S * 1.5, rnd));
    root.add(shadowed(new THREE.Mesh(mergeGeometries(todos.flatMap((a) => a.casca)), M.bark), false, true));
    const por = Math.max(5, Math.round(14 * densidade));
    const total = todos.reduce((n, a) => n + a.cachos.length * por, 0);
    const inst = shadowed(new THREE.InstancedMesh(cardGeo, sprigMats[2], total), true, true);
    let k = 0;
    spots.forEach(([, , S], i) => { k = folhas(inst, k, todos[i].cachos, por, 0.3 * S * 1.5, rnd, 0.75, 0.72); });
    root.add(inst);
  }
  // V1: canteiros com flores de verdade — touceira de folhas compridas, caules finos e flores de 5 pétalas com miolo.
  // 4 malhas instanciadas no total (folhas, caules, pétalas, miolos), coloridas por instância.
  {
    const beds = [[4.4, 6.0, 3.95, 4.7], [-7.7, -6.85, 3.8, 7.2], [0.5, 1.7, 7.3, 7.95]]; // fora do deck (x -6,6..1,8 · z 3,9..6,8)
    const cores = [0xf2c14e, 0xe86a7a, 0xf4f1ea, 0xb07fd1, 0xf29d52, 0xd94f6b];
    let seed = 1;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const plantas = [];
    for (const [x0, x1, z0, z1] of beds) {
      const n = Math.round(((x1 - x0) * (z1 - z0)) / 0.09);
      for (let i = 0; i < n; i++) plantas.push([x0 + r() * (x1 - x0), z0 + r() * (z1 - z0), 1.4 + r() * 0.6, r()]);
    }
    // folha comprida (lâmina larga dobrada no meio), 6 por touceira
    const folha = (() => {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + i, cs = Math.cos(a), sn = Math.sin(a), w = 0.018, h = 0.13 + (i % 3) * 0.03, l = 0.07;
        // dois triângulos: base larga → ponta inclinada para fora
        pts.push(-sn * w, 0, cs * w, sn * w, 0, -cs * w, cs * l, h, sn * l);
        pts.push(-sn * w, 0, cs * w, cs * l * 0.5, h * 0.55, sn * l * 0.5 + 0.004, cs * l, h, sn * l);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.computeVertexNormals();
      return g;
    })();
    const caule = new THREE.CylinderGeometry(0.003, 0.004, 1, 4).translate(0, 0.5, 0);
    const petalas = (() => {
      const gs = [];
      for (let i = 0; i < 5; i++) {
        const pg = new THREE.CircleGeometry(0.022, 8).scale(0.55, 1, 1).translate(0, 0.02, 0);
        pg.rotateX(-Math.PI / 2 + 0.45);       // abre para cima, levemente em taça
        pg.rotateY((i / 5) * Math.PI * 2);
        gs.push(pg);
      }
      return mergeGeometries(gs);
    })();
    const verde = std({ color: 0x3d6a2c, roughness: 0.8, side: THREE.DoubleSide });
    const iFolha = new THREE.InstancedMesh(folha, verde, plantas.length);
    const iCaule = new THREE.InstancedMesh(caule, std({ color: 0x4c7a33, roughness: 0.8 }), plantas.length * 3);
    const iPet = new THREE.InstancedMesh(petalas, std({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide }), plantas.length * 3);
    const iMiolo = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.008, 0), std({ color: 0xe0a92a, roughness: 0.7 }), plantas.length * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), v = new THREE.Vector3(), um = new THREE.Vector3(1, 1, 1);
    plantas.forEach(([x, z, s, k], i) => {
      iFolha.setMatrixAt(i, m.compose(v.set(x, 0, z), q.setFromEuler(e.set(0, k * 6, 0)), new THREE.Vector3(s, s, s)));
      iFolha.setColorAt(i, c.setRGB(0.85 + k * 0.25, 0.9 + k * 0.2, 0.85));
      const cor = cores[Math.floor(k * 997) % cores.length];
      for (let j = 0; j < 3; j++) {
        const a = k * 6 + (j / 3) * Math.PI * 2, d = 0.03 * s, h = (0.17 + ((j * 7 + i) % 5) * 0.025) * s;
        const fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d;
        q.setFromEuler(e.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12));
        iCaule.setMatrixAt(i * 3 + j, m.compose(v.set(fx, 0, fz), q, new THREE.Vector3(1, h, 1)));
        const topo = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(new THREE.Vector3(fx, 0, fz));
        q.setFromEuler(e.set(Math.sin(a) * 0.25, a, -Math.cos(a) * 0.25));
        iPet.setMatrixAt(i * 3 + j, m.compose(topo, q, um.clone().multiplyScalar(s)));
        iPet.setColorAt(i * 3 + j, c.set(cor).multiplyScalar(0.9 + j * 0.06));
        iMiolo.setMatrixAt(i * 3 + j, m.compose(topo.clone().add(new THREE.Vector3(0, 0.006, 0)), q.identity(), um.clone().multiplyScalar(s)));
      }
    });
    shadowed(iFolha, true, true);
    root.add(iFolha, iCaule, iPet, iMiolo);
  }
  // V1: tufos de grama — 5 lâminas 3D finas e baixas (até ~16 cm), da cor do gramado: base escura, ponta clara.
  // Sem textura com recorte alfa (antes eram cartões PNG altos e espalhados que destoavam da casa).
  {
    const laminas = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + i * 0.7, d = 0.02 + (i % 2) * 0.025;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.1 + ((i * 37) % 7) / 100;
      const lx = Math.cos(a) * 0.035, lz = Math.sin(a) * 0.035, w = 0.014;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      laminas.push(x - px, 0, z - pz, x + px, 0, z + pz, x + lx, h, z + lz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(laminas, 3));
    const nrm = [], cor = [];
    const baixo = new THREE.Color(0x2f4f1f), ponta = new THREE.Color(0x7aa448);
    for (let i = 0; i < laminas.length / 9; i++) {
      for (let k = 0; k < 3; k++) {
        nrm.push(0, 1, 0); // sombreia como o gramado
        const c = k === 2 ? ponta : baixo;
        cor.push(c.r, c.g, c.b);
      }
    }
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
    const grassMat = std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 });
    const blocked = [[-9.4, -7.1, 7.7, 10.1], [-6.8, 8.9, -4.2, 4.2], [-7.1, 2.0, 3.8, 6.9], [-7.0, -0.1, 7.1, 12], [2.1, 3.9, 3.8, 12], [6.1, GAR_X1 + 0.2, -4, 12]];
    const ok = (x, z) => !blocked.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
    const pts = [];
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (pts.length < (hi ? 9000 : quality === 'medium' ? 5000 : 2500)) {
      const x = (r() - 0.5) * (LW - 1.2), z = (r() - 0.5) * (LD - 1.2);
      if (ok(x, z)) pts.push([x, z]);
    }
    const inst = new THREE.InstancedMesh(geo, grassMat, pts.length);
    inst.receiveShadow = true;
    const c = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler();
    pts.forEach(([x, z], i) => {
      const s = 0.7 + r() * 0.6;
      q.setFromEuler(e.set((r() - 0.5) * 0.2, r() * 6, (r() - 0.5) * 0.2));
      inst.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.8 + r() * 0.5), s)));
      const k = 0.8 + r() * 0.3, seca = r() < 0.12 ? 0.12 : 0; // algumas touceiras mais secas, como as manchas do chão
      inst.setColorAt(i, c.setRGB(k + seca, k + seca * 0.4, k * 0.9));
    });
    root.add(inst);
  }
  // pedras decorativas
  for (const [x, z, s] of [[-0.2, 7.3, 0.35], [0.2, 7.6, 0.22], [-7.3, 10.8, 0.4], [-6.9, 11.2, 0.25], [10.9, 11.0, 0.3]]) {
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
  let sonarBeam = null;
  if (sensores.garagem) {
    const g = new THREE.Group();
    g.position.set(CARRO_X, 0, SONAR_Z - 0.06);
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
    anchor('garagem', CARRO_X, 1.45, SONAR_Z);
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
  if (sensores.ldr) {
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
  // Luzes internas/externas por cômodo (state.rooms; a luz geral é o D1/V0)
  // ================================================================
  addPoint(0xffb86b, 22, 10, -3.0, 2.9, 1.3, 'sala');        // sala (34 deixava mancha no teto)
  addPoint(0xffc98a, 18, 9, 2.6, 2.8, -1.2, 'cozinha');      // jantar/cozinha
  addPoint(0xffb86b, 26, 8, 2.0, UFL + 2.5, -0.8, 'quarto'); // superior (quarto/escritório)
  // área externa: só a qualidade alta usa luzes reais; as outras usam poças de luz (mesmo visual, custo ~zero)
  const eaves = [[-4.8, 3.72, -4.8, 5.2, 0.12], [-0.4, 3.72, -0.4, 5.2, 0.12], [3.0, 3.72, 3.0, 4.9, 0.09], [CARRO_X, 3.72, CARRO_X, 2.2, 0.09]];
  if (hi) {
    addPoint(0xffc27a, 10, 7, 3.0, 0.9, 7.6, 'externa'); // caminho
    for (const [x, z, tx, tz] of eaves) {
      const sp = new THREE.SpotLight(0xffc88a, 0, 9, 0.62, 0.85, 2);
      sp.position.set(x, SLAB0 - 0.02, z);
      sp.target.position.set(tx, 0, tz);
      root.add(sp, sp.target);
      pointLights.push({ light: sp, base: 60, zone: 'externa' });
    }
  } else {
    for (const [, , tx, tz, y] of eaves) lightPool(0xffc88a, tx, y + 0.01, tz, 1.9, 1.9, 0.5, 'externa');
    lightPool(0xffc27a, 3.0, 0.08, 7.6, 2.4, 3.2, 0.32, 'externa');    // caminho
  }

  // ================================================================
  // Estado e animação
  // ================================================================
  const S = {
    zone: { sala: 0, cozinha: 0, quarto: 0, externa: 0 }, zoneT: { sala: 0, cozinha: 0, quarto: 0, externa: 0 },
    door: 0, doorT: 0,
    win: 0, winT: 0,
    alarm: 0, alarmT: 0, armed: false,
    presence: 0, presenceT: 0, presenceHold: 0, // B5: holograma fica no mínimo 3 s depois de cada detecção
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
    // nível 0–100 de cada cômodo vindo do servidor (state.rooms); servidor antigo sem cômodos: tudo segue o D1 (V0)
    for (const k in S.zoneT) S.zoneT[k] = meta.rooms ? Math.min(1, Math.max(0, Number(meta.rooms[k]) / 100 || 0)) : v.V0 === '1' ? 1 : 0;
    S.doorT = v.V1 === '1' ? 1 : 0;
    S.winT = v.V7 === 'ABERTA' ? 1 : 0;
    S.armed = v.V9 === '1';
    S.alarmT = /ATIVO/i.test(v.V8 || '') ? 1 : 0;
    if (v.V11 === '1' && S.presenceT === 0) S.presenceHold = performance.now() + 3000;
    S.presenceT = v.V11 === '1' ? 1 : 0;
    S.dist = v.V12 === undefined || v.V12 === '' ? NaN : Number(v.V12);
    S.ev = meta.carro || null; // V3: carregador e carro na garagem (server/carregador.js)
    S.gapT = S.ev && !S.ev.naGaragem ? CAR_FORA : distToGap(S.dist);
    drawEvScreen(S.ev);
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
  // V3: carro fora (cena Saí): vai até o fim da calçada e some; na cena Cheguei volta de lá até a vaga
  const CAR_FORA = 9;
  function distToGap(cm) {
    if (!sensores.garagem) return 0.6;   // sem HC-SR04: carro estacionado no fundo da vaga
    if (!Number.isFinite(cm)) return 6;
    const k = THREE.MathUtils.clamp((cm - 4) / 96, 0, 1);
    return 0.12 + k * 5.9;
  }

  function pulse() { S.pulse = 1; rings.forEach((r) => (r.t = Math.min(r.t, 0.05))); }

  const tmpV = new THREE.Vector3();
  function update(dt, t) {
    // luzes por cômodo
    const Z = S.zone;
    for (const k in Z) Z[k] = damp(Z[k], S.zoneT[k], 5, dt);
    const nightBoost = 0.35 + S.night * 0.65;
    for (const p of pointLights) p.light.intensity = p.base * Z[p.zone] * nightBoost;
    // lâmpadas/fitas: brilho contido à noite (antes chegava a 6,9 e o bloom "estourava")
    for (const [m, day, night, zone] of lightMats) m.emissiveIntensity = Z[zone] * (day + S.night * (night - day));
    for (const lp of lightPools) lp.mat.opacity = lp.base * Z[lp.zone] * (lp.noite ? S.night : 0.15 + S.night * 0.85);
    // cáusticas: sol de dia; à noite só com a luz externa (luminária da piscina)
    causticMat.uniforms.uOpacity.value = 0.35 * (1 - S.night) + Z.externa * S.night * 0.7;
    causticMat.uniforms.uTime.value = t;
    M.poolLight.emissiveIntensity = Z.externa * (0.3 + S.night * 0.3); // antes 2,8: virava uma estrela na água
    // relógio da TV: redesenha ao virar o minuto, mesmo sem estado novo
    if (Math.floor(Date.now() / 60000) !== tvMinute) drawTV();

    // sombras só são recalculadas quando algo que projeta sombra se move (ver main.js)
    S.moving = Math.abs(S.door - S.doorT) > 1e-3 || Math.abs(S.win - S.winT) > 1e-3 || Math.abs(S.gap - S.gapT) > 1e-3 || (S.atualizaSombra > 0 && S.atualizaSombra-- > 0);

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
    S.presence = damp(S.presence, S.presenceT || performance.now() < S.presenceHold ? 1 : 0, 4, dt);
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
    if (sonarBeam) {
      sonarBeam.scale.set(1, Math.max(0.1, S.gap), 1);
      sonarBeam.position.set(0, 0.7, 0.15 + S.gap / 2);
    }
    sonarMat.opacity = S.online && zone >= 0 ? 0.05 + 0.04 * Math.sin(t * 12) : 0.012;

    // V3: carro some no fim da calçada; cabo no carro só com ele parado na vaga; LED pela situação da carga
    car.visible = !(S.gapT >= CAR_FORA && S.gap > CAR_FORA - 1.2);
    const ev = S.ev;
    const naVaga = !!ev?.naGaragem && Math.abs(S.gap - S.gapT) < 0.05;
    if (evCablePlug) { evCablePlug.visible = naVaga; evCableHolster.visible = !naVaga; }
    const evCor = !ev || !naVaga ? null : ev.carregando ? 0x36e39a : ev.aguardando ? 0xffb020 : 0x5ee7ff;
    const evPulso = ev?.carregando ? 0.55 + 0.45 * Math.sin(t * 3) : 1;
    if (evCor !== null) { evLedMat.emissive.setHex(evCor); evPortMat.emissive.setHex(evCor); }
    evLedMat.emissiveIntensity = evCor === null ? 0.15 : 1.8 * evPulso;
    evPortMat.emissiveIntensity = evCor === null ? 0 : 1.4 * evPulso;

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
      tr.crown.rotation.z = Math.sin(t * 0.9 + tr.phase) * 0.007; // a árvore gira em torno do pé: ângulo pequeno
      tr.crown.rotation.x = Math.cos(t * 0.7 + tr.phase) * 0.005;
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
