// Texturas procedurais — geradas em canvas, sem arquivos externos.
import * as THREE from 'three';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ruído de valor periódico (textura repete sem emenda)
function fbm(size, period, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const p = period * (1 << o);
    const r = rng(seed + o * 101);
    const lat = new Float32Array(p * p);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * p, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % p;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * p, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % p;
        const a = lat[y0 * p + x0], b = lat[y0 * p + x1];
        const c = lat[y1 * p + x0], d = lat[y1 * p + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy);
      }
    }
    total += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// desfoque leve (o próprio canvas faz): tira o serrilhado dos traços antes de virar textura
function soften(c, px) {
  const out = canvas(c.width), g = out.getContext('2d');
  if ('filter' in g) { g.filter = `blur(${px}px)`; }
  // desenha deslocado nas 9 posições (bordas repetem, textura continua sem emenda)
  for (const dx of [-c.width, 0, c.width]) for (const dy of [-c.height, 0, c.height]) g.drawImage(c, dx, dy);
  return out;
}

function toTexture(c, { repeat = [1, 1], color = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paintField(size, field, colorA, colorB, jitter = 0, seed = 1) {
  const c = canvas(size), g = c.getContext('2d');
  const img = g.createImageData(size, size), r = rng(seed);
  const A = new THREE.Color(colorA), B = new THREE.Color(colorB);
  for (let i = 0; i < field.length; i++) {
    // ruído por pixel bem fraco: forte demais vira "granulado" que cintila ao mover a câmera
    const t = field[i], j = (r() - 0.5) * jitter * 0.2;
    img.data[i * 4] = Math.min(255, Math.max(0, (A.r + (B.r - A.r) * t) * 255 + j));
    img.data[i * 4 + 1] = Math.min(255, Math.max(0, (A.g + (B.g - A.g) * t) * 255 + j));
    img.data[i * 4 + 2] = Math.min(255, Math.max(0, (A.b + (B.b - A.b) * t) * 255 + j));
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function plaster() {
  const f = fbm(512, 8, 5, 11);
  return toTexture(paintField(512, f, '#e9e5de', '#f7f5f1', 6, 3), { repeat: [2, 2] });
}

export function darkPlaster() {
  const f = fbm(512, 8, 5, 12);
  return toTexture(paintField(512, f, '#2d3034', '#3b3f44', 5, 4), { repeat: [2, 2] });
}

export function concrete() {
  const f = fbm(512, 6, 6, 21, 0.55);
  const c = paintField(512, f, '#8e8c87', '#b3b0aa', 14, 5);
  const g = c.getContext('2d'), r = rng(9);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(40,40,40,${0.08 + r() * 0.15})`;
    g.beginPath(); g.arc(r() * 512, r() * 512, r() * 1.6 + 0.3, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c, { repeat: [3, 3] });
}

// V1: gramado mais realista — três tons de verde em manchas grandes, áreas mais secas (amareladas) e um pouco de
// terra aparecendo, coberto de lâminas curtas em vários tons (as mesmas cores dos tufos 3D) e trevos.
// O mesmo desenho, em cinza, vira o relevo (bumpMap) do gramado.
let gramaCanvas = null;
export function grass() {
  const size = 1024;
  const f1 = fbm(size, 5, 5, 31, 0.55), f2 = fbm(size, 9, 4, 32, 0.5), f3 = fbm(size, 14, 3, 33, 0.5);
  const c = canvas(size), g = c.getContext('2d'), img = g.createImageData(size, size), r = rng(76);
  const escuro = new THREE.Color('#335222'), medio = new THREE.Color('#4c7430'), claro = new THREE.Color('#6a9140');
  const seco = new THREE.Color('#8a8c45'), terra = new THREE.Color('#5c4a30'), k = new THREE.Color();
  for (let i = 0; i < f1.length; i++) {
    const t = f1[i];
    k.copy(escuro).lerp(medio, Math.min(1, t * 1.6)).lerp(claro, Math.max(0, t - 0.55) * 1.8);
    const sec = Math.max(0, f2[i] - 0.6) * 2.2; // manchas mais secas
    if (sec > 0) k.lerp(seco, Math.min(0.55, sec));
    const ter = Math.max(0, f3[i] - 0.74) * 3; // falhas com terra
    if (ter > 0) k.lerp(terra, Math.min(0.45, ter));
    const j = (r() - 0.5) * 0.035;
    img.data[i * 4] = Math.min(255, Math.max(0, (k.r + j) * 255));
    img.data[i * 4 + 1] = Math.min(255, Math.max(0, (k.g + j) * 255));
    img.data[i * 4 + 2] = Math.min(255, Math.max(0, (k.b + j) * 255));
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // lâminas curtas: tons das lâminas 3D (base escura → ponta clara) e algumas secas
  g.lineCap = 'round';
  const tons = ['#2c4a1d', '#3b5e26', '#4f7a31', '#64903d', '#7aa448', '#8f9a4a'];
  for (let i = 0; i < 42000; i++) {
    const x = r() * size, y = r() * size, l = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 1.4;
    g.strokeStyle = tons[Math.floor(Math.pow(r(), 1.3) * tons.length)];
    g.globalAlpha = 0.18 + r() * 0.3;
    g.lineWidth = 0.9 + r() * 1.1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // trevos (três bolinhas) espalhados em grupos
  for (let i = 0; i < 160; i++) {
    const cx = r() * size, cy = r() * size;
    for (let n = 0; n < 6 + r() * 10; n++) {
      const x = cx + (r() - 0.5) * 40, y = cy + (r() - 0.5) * 40;
      g.fillStyle = r() > 0.5 ? '#5d8a36' : '#4a7a2e'; g.globalAlpha = 0.55;
      for (let p = 0; p < 3; p++) { const a = p * 2.1 + r(); g.beginPath(); g.arc(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 2, 0, Math.PI * 2); g.fill(); }
    }
  }
  g.globalAlpha = 1;
  gramaCanvas = soften(c, 0.6);
  return toTexture(gramaCanvas, { repeat: [7, 5] });
}
// relevo do gramado: luminância do próprio desenho (lâminas claras sobressaem)
export function grassBump() {
  if (!gramaCanvas) grass();
  const size = gramaCanvas.width, c = canvas(size), g = c.getContext('2d');
  g.drawImage(gramaCanvas, 0, 0);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const l = img.data[i] * 0.3 + img.data[i + 1] * 0.6 + img.data[i + 2] * 0.1;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = l;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { repeat: [7, 5], color: false });
}

export function soil() {
  const size = 512, c = canvas(size), g = c.getContext('2d');
  const f = fbm(size, 8, 5, 41);
  const img = g.createImageData(size, size);
  const bands = ['#5b3f27', '#6e4c2f', '#4d3420', '#7a5836', '#5e4128'];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const b = Math.floor(((y / size) * 5 + f[i] * 1.3) % 5);
      const col = new THREE.Color(bands[b]).offsetHSL(0, 0, (f[i] - 0.5) * 0.12);
      img.data[i * 4] = col.r * 255; img.data[i * 4 + 1] = col.g * 255;
      img.data[i * 4 + 2] = col.b * 255; img.data[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const r = rng(5);
  for (let i = 0; i < 500; i++) {
    const s = 1 + r() * 4;
    g.fillStyle = `rgba(${150 + r() * 60},${140 + r() * 50},${120 + r() * 40},${0.35 + r() * 0.4})`;
    g.beginPath(); g.ellipse(r() * size, r() * size, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c, { repeat: [6, 1] });
}

export function rock() {
  const size = 512, f = fbm(size, 5, 6, 51, 0.6);
  const c = paintField(size, f, '#4a4b4d', '#8a8781', 18, 9);
  const g = c.getContext('2d'), r = rng(12);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(30,30,32,${0.15 + r() * 0.25})`;
    g.lineWidth = 1 + r() * 2;
    const y = r() * size;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= size; x += 32) g.lineTo(x, y + (r() - 0.5) * 18);
    g.stroke();
  }
  return toTexture(c, { repeat: [5, 1] });
}

function woodGrain(g, x, y, w, h, base, r, vertical) {
  const col = new THREE.Color(base).offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08);
  g.fillStyle = `#${col.getHexString()}`;
  g.fillRect(x, y, w, h);
  const lines = 10 + Math.floor(r() * 10);
  for (let i = 0; i < lines; i++) {
    const dark = r() > 0.4;
    g.strokeStyle = dark ? `rgba(40,22,10,${0.06 + r() * 0.14})` : `rgba(255,230,190,${0.04 + r() * 0.08})`;
    g.lineWidth = 1.3 + r() * 1.8;
    g.beginPath();
    if (vertical) {
      let px = x + r() * w;
      g.moveTo(px, y);
      for (let yy = y; yy <= y + h; yy += 12) { px += (r() - 0.5) * 1.6; g.lineTo(px, yy); }
    } else {
      let py = y + r() * h;
      g.moveTo(x, py);
      for (let xx = x; xx <= x + w; xx += 12) { py += (r() - 0.5) * 1.6; g.lineTo(xx, py); }
    }
    g.stroke();
  }
}

export function woodFloor(base = '#b98a5c') {
  const size = 1024, c = canvas(size), g = c.getContext('2d'), r = rng(61);
  const rows = 8, rh = size / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * 300;
    while (x < size) {
      const len = 260 + r() * 360;
      woodGrain(g, x, row * rh, len, rh, base, r, false);
      g.fillStyle = 'rgba(30,18,8,0.55)';
      g.fillRect(x, row * rh, 2, rh);
      x += len;
    }
    g.fillStyle = 'rgba(30,18,8,0.5)';
    g.fillRect(0, row * rh, size, 2);
  }
  return toTexture(soften(c, 0.6), { repeat: [3, 3] });
}

export function woodBoard(base = '#8a5a36', vertical = false, seed = 71) {
  const size = 512, c = canvas(size), g = c.getContext('2d'), r = rng(seed);
  woodGrain(g, 0, 0, size, size, base, r, vertical);
  // mais veios para a peça única
  for (let k = 0; k < 3; k++) woodGrain(g, 0, 0, size, size, base, () => 0.5 + (r() - 0.5) * 0.02, vertical);
  const f = fbm(size, 4, 4, seed);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < f.length; i++) {
    const m = 0.9 + f[i] * 0.2;
    img.data[i * 4] *= m; img.data[i * 4 + 1] *= m; img.data[i * 4 + 2] *= m;
  }
  g.putImageData(img, 0, 0);
  return toTexture(soften(c, 0.6));
}

export function waterNormal() {
  const size = 512, h = fbm(size, 6, 5, 91, 0.55);
  const c = canvas(size), g = c.getContext('2d'), img = g.createImageData(size, size);
  const s = 6.0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = h[y * size + ((x - 1 + size) % size)], rr = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
      let nx = (l - rr) * s, ny = (u - d) * s, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      img.data[i * 4] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i * 4 + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i * 4 + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { color: false, repeat: [2, 1] });
}

export function poolTile() {
  const size = 512, c = canvas(size), g = c.getContext('2d'), r = rng(101);
  const n = 16, s = size / n;
  g.fillStyle = '#d7eef0'; g.fillRect(0, 0, size, size);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const col = new THREE.Color('#4fb7c9').offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.12);
    g.fillStyle = `#${col.getHexString()}`;
    g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
  }
  return toTexture(c, { repeat: [6, 3] });
}

export function rug() {
  const size = 512, f = fbm(size, 32, 3, 111);
  const c = paintField(size, f, '#b9ad9b', '#cfc4b3', 10, 13);
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(70,60,50,0.55)'; g.lineWidth = 10;
  g.strokeRect(30, 30, size - 60, size - 60);
  g.lineWidth = 3; g.strokeRect(56, 56, size - 112, size - 112);
  return toTexture(c);
}

export function solarPanel() {
  const size = 512, c = canvas(size), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, '#0d1b33'); grd.addColorStop(1, '#16294a');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  // só a grade das células (linhas finas extras geravam moiré/chuvisco de longe)
  g.strokeStyle = 'rgba(170,188,212,0.42)'; g.lineWidth = 5;
  const cols = 6, rows = 10;
  for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * size / cols, 0); g.lineTo(i * size / cols, size); g.stroke(); }
  for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(0, j * size / rows); g.lineTo(size, j * size / rows); g.stroke(); }
  // reflexo suave do céu, dá leitura de vidro
  const sh = g.createLinearGradient(0, 0, size, size * 0.6);
  sh.addColorStop(0, 'rgba(160,190,230,0.16)'); sh.addColorStop(0.5, 'rgba(160,190,230,0)'); sh.addColorStop(1, 'rgba(160,190,230,0.06)');
  g.fillStyle = sh; g.fillRect(0, 0, size, size);
  return toTexture(c);
}

export function stone() {
  const f = fbm(256, 6, 5, 131, 0.55);
  return toTexture(paintField(256, f, '#bdb6aa', '#d9d3c8', 12, 17));
}

// V1: raminho de folhas com transparência — galho curvo com 9 folhas alternadas, cada uma com nervura,
// lado claro/escuro e ponta fina. Cartões pequenos com este desenho formam a copa (folhas, não manchas).
export function leafSprig(seed = 201, hue = 0.27) {
  const size = 256, c = canvas(size), g = c.getContext('2d'), r = rng(seed);
  const caule = (t) => [128 + Math.sin(t * 2.4 + 0.4) * 14, 246 - t * 222];
  g.strokeStyle = '#4b3a22'; g.lineWidth = 3.2; g.lineCap = 'round';
  g.beginPath();
  for (let t = 0; t <= 1.001; t += 0.05) { const [x, y] = caule(t); t === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
  g.stroke();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = 0.12 + (i / (n - 1)) * 0.86;
    const [x, y] = caule(t);
    const lado = i === n - 1 ? 0 : i % 2 ? 1 : -1;
    const ang = -Math.PI / 2 + lado * (0.75 + r() * 0.35) + (r() - 0.5) * 0.2;
    const len = (i === n - 1 ? 62 : 70 - t * 18) * (0.85 + r() * 0.3), w = len * (0.34 + r() * 0.06);
    const col = new THREE.Color().setHSL(hue + (r() - 0.5) * 0.04, 0.45 + r() * 0.12, 0.26 + r() * 0.1);
    const claro = col.clone().offsetHSL(0.01, 0.02, 0.1), escuro = col.clone().multiplyScalar(0.62);
    g.save(); g.translate(x, y); g.rotate(ang + Math.PI / 2);
    // folha apontando para cima (eixo -y), metade de cada cor
    for (const [m, cor] of [[-1, claro], [1, escuro]]) {
      const grd = g.createLinearGradient(0, 0, 0, -len);
      grd.addColorStop(0, `#${cor.clone().multiplyScalar(0.8).getHexString()}`); grd.addColorStop(0.6, `#${cor.getHexString()}`);
      grd.addColorStop(1, `#${cor.clone().offsetHSL(0, 0, 0.05).getHexString()}`);
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(m * w * 0.75, -len * 0.25, m * w * 0.55, -len * 0.75, 0, -len);
      g.lineTo(0, 0); g.fill();
    }
    g.strokeStyle = 'rgba(210,230,160,0.35)'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.92); g.stroke();
    g.strokeStyle = 'rgba(20,40,10,0.25)'; g.lineWidth = 0.7;
    for (let k = 1; k < 5; k++) { const yy = -len * k / 5.5; g.beginPath(); g.moveTo(0, yy); g.lineTo(w * 0.35, yy - len * 0.08); g.moveTo(0, yy); g.lineTo(-w * 0.35, yy - len * 0.08); g.stroke(); }
    g.restore();
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// V1: casca de árvore — fissuras verticais irregulares sobre marrom acinzentado (repete em volta do galho)
export function bark() {
  const W = 256, H = 512, c = document.createElement('canvas'), r = rng(611);
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const f = fbm(W, 4, 4, 612, 0.5);
  const img = g.createImageData(W, H);
  const A = new THREE.Color('#6b5643'), B = new THREE.Color('#a08a70');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = f[(y % W) * W + x], i = (y * W + x) * 4;
    img.data[i] = (A.r + (B.r - A.r) * t) * 255; img.data[i + 1] = (A.g + (B.g - A.g) * t) * 255;
    img.data[i + 2] = (A.b + (B.b - A.b) * t) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    let x = r() * W, y = r() * H;
    const l = 40 + r() * 160;
    g.strokeStyle = `rgba(40,30,20,${0.3 + r() * 0.3})`; g.lineWidth = 1.5 + r() * 3;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < l; k += 10) { x += (r() - 0.5) * 5; y += 10; g.lineTo(((x % W) + W) % W, y % H); }
    g.stroke();
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(150,135,110,${0.06 + r() * 0.1})`;
    g.fillRect(r() * W, r() * H, 2 + r() * 6, 1 + r() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
