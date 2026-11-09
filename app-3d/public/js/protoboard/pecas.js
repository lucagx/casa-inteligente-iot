// Peças low-poly da protoboard, feitas só com primitivas do three.js.
// Unidade: 1 = passo da protoboard (2,54 mm). Topo da protoboard em y = 0; colunas 1..63 em x = coluna − 32.
// As peças já nascem na posição da montagem (layout fixo), então cada função devolve o grupo pronto.
import * as THREE from "three";

export const LINHA = {
  a: -5.5, b: -4.5, c: -3.5, d: -2.5, e: -1.5,
  f: 1.5, g: 2.5, h: 3.5, i: 4.5, j: 5.5,
  "t+": -9.5, "t-": -8.5, // trilhos de trás: 5 V (Vin) e GND
  "b-": 8.5, "b+": 9.5, // trilhos da frente: GND e 3,3 V
};
export const xCol = (c) => c - 32;
export const furo = (c, l, y = 0) => new THREE.Vector3(xCol(c), y, LINHA[l]);
export const MESA = -3.4; // tampo onde a protoboard e os módulos de fora apoiam
export const UP = new THREE.Vector3(0, 1, 0);

// ---------- utilitários ----------

export function mat(cor, o = {}) {
  return new THREE.MeshStandardMaterial({
    color: cor,
    roughness: o.rough ?? 0.7,
    metalness: o.metal ?? 0,
    flatShading: o.flat ?? true,
    ...(o.extra || {}),
  });
}
const metal = () => mat("#c4cad2", { rough: 0.38, metal: 0.35 });
const ouro = () => mat("#d9b45a", { rough: 0.4, metal: 0.4 });

function em(mesh, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z);
  return mesh;
}
const caixa = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cil = (r, h, m, seg = 16, r2 = r) => new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), m);
// cilindro deitado ao longo de x
function cilX(r, len, m, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  return new THREE.Mesh(g, m);
}
// caixa com material só no topo (+y) ou na frente (+z)
function caixaFace(w, h, d, lado, face, indice) {
  const ms = [lado, lado, lado, lado, lado, lado];
  ms[indice] = face;
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ms);
}
const TOPO = 2, TRAS = 5; // índices das faces da BoxGeometry (+y e −z)

function tela(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  return [c, c.getContext("2d")];
}
// texto girado no próprio lugar (a vista é pelo lado dos trilhos de 5 V: o texto fica de cabeça para baixo no canvas)
function texto(g, s, x, y, ang = Math.PI) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillText(s, 0, 0);
  g.restore();
}
function textura(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- protoboard 830 furos ----------

function texturaProtoboard(W, D) {
  const P = 32;
  const [c, g] = tela(W * P, D * P);
  const px = (x) => (x + W / 2) * P;
  const pz = (z) => (z + D / 2) * P;
  g.fillStyle = "#ebe7dc";
  g.fillRect(0, 0, c.width, c.height);
  // canal central
  const gr = g.createLinearGradient(0, pz(-0.75), 0, pz(0.75));
  gr.addColorStop(0, "#d6d0c3");
  gr.addColorStop(0.5, "#9f998d");
  gr.addColorStop(1, "#d6d0c3");
  g.fillStyle = gr;
  g.fillRect(0, pz(-0.75), c.width, 1.5 * P);
  // faixas dos trilhos (vermelho = +, azul = −)
  const faixa = (z, cor) => {
    g.fillStyle = cor;
    g.fillRect(px(-31.6), pz(z) - 0.07 * P, 63.2 * P, 0.14 * P);
  };
  faixa(-10.15, "#d9434f");
  faixa(-7.85, "#3d6fd6");
  faixa(7.85, "#3d6fd6");
  faixa(10.15, "#d9434f");
  // furos
  const f = 0.46 * P;
  const furoQ = (x, z) => {
    g.fillStyle = "#5b5e66";
    g.fillRect(px(x) - f / 2, pz(z) - f / 2, f, f);
    g.fillStyle = "#1c1e23";
    g.fillRect(px(x) - f / 2 + 2, pz(z) - f / 2 + 2, f - 3, f - 3);
  };
  for (let col = 1; col <= 63; col++) {
    for (const l of "abcdefghij") furoQ(xCol(col), LINHA[l]);
    if (col % 6 !== 0) for (const l of ["t+", "t-", "b-", "b+"]) furoQ(xCol(col), LINHA[l]);
  }
  // letras das linhas e números das colunas
  g.fillStyle = "#9a9488";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${0.6 * P}px Arial, sans-serif`;
  for (const l of "abcdefghij") {
    texto(g, l, px(-32.05), pz(LINHA[l]));
    texto(g, l, px(32.05), pz(LINHA[l]));
  }
  g.font = `700 ${0.55 * P}px Arial, sans-serif`;
  for (let col = 1; col <= 63; col++) {
    if (col !== 1 && col % 5 !== 0) continue;
    texto(g, String(col), px(xCol(col)), pz(-6.6));
    texto(g, String(col), px(xCol(col)), pz(6.6));
  }
  g.font = `700 ${0.8 * P}px Arial, sans-serif`;
  for (const [s, z, cor] of [["+", -9.5, "#d9434f"], ["−", -8.5, "#3d6fd6"], ["−", 8.5, "#3d6fd6"], ["+", 9.5, "#d9434f"]]) {
    g.fillStyle = cor;
    texto(g, s, px(-32.05), pz(z));
    texto(g, s, px(32.05), pz(z));
  }
  return textura(c);
}

export function criarProtoboard() {
  const W = 65, D = 21.6, H = 3.4;
  const g = new THREE.Group();
  const lado = mat("#cfcabd", { rough: 0.85 });
  const topo = mat("#ffffff", { rough: 0.8, extra: { map: texturaProtoboard(W, D) } });
  g.add(em(caixaFace(W, H, D, lado, topo, TOPO), 0, -H / 2, 0));
  // encaixes laterais (para juntar protoboards)
  for (const z of [-6, 6]) g.add(em(caixa(0.6, 1.8, 2.2, lado), -W / 2 - 0.3, -1.5, z));
  return g;
}

// ---------- NodeMCU ESP8266 (Amica v2), pinos nas colunas 2..16, linhas b e i ----------

const PINOS_D = ["D0", "D1", "D2", "D3", "D4", "3V3", "GND", "D5", "D6", "D7", "D8", "RX", "TX", "GND", "3V3"];
const PINOS_A = ["A0", "RSV", "RSV", "SD3", "SD2", "SD1", "CMD", "SD0", "CLK", "GND", "3V3", "EN", "RST", "GND", "Vin"];

function texturaESP(L, Wd) {
  const P = 64;
  const [c, g] = tela(L * P, Wd * P);
  const px = (x) => (x + L / 2) * P;
  const pz = (z) => (z + Wd / 2) * P;
  g.fillStyle = "#172540";
  g.fillRect(0, 0, c.width, c.height);
  // trilhas sutis
  g.strokeStyle = "rgba(120,165,230,0.16)";
  g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const x = -8 + i * 1.1;
    g.beginPath();
    g.moveTo(px(x), pz(-3.6));
    g.lineTo(px(x), pz(-1.2 + (i % 3) * 0.5));
    g.lineTo(px(x + 1.3), pz(0.6 + (i % 2)));
    g.lineTo(px(x + 1.3), pz(3.6));
    g.stroke();
  }
  // ilhas dos pinos e nomes (texto girado, como a serigrafia)
  g.font = `700 ${0.4 * P}px Arial, sans-serif`;
  g.fillStyle = "#e9eef7";
  g.textBaseline = "middle";
  for (let i = 0; i < 15; i++) {
    const x = 7 - i; // D0 / A0 do lado da antena (+x)
    for (const z of [-4.5, 4.5]) {
      g.fillStyle = "#d8b25a";
      g.beginPath();
      g.arc(px(x), pz(z), 0.36 * P, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#8b6f2c";
      g.beginPath();
      g.arc(px(x), pz(z), 0.15 * P, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#e9eef7";
    g.save();
    g.translate(px(x), pz(3.95));
    g.rotate(Math.PI / 2);
    g.textAlign = "right";
    g.fillText(PINOS_D[i], 0, 0);
    g.restore();
    g.save();
    g.translate(px(x), pz(-3.95));
    g.rotate(Math.PI / 2);
    g.textAlign = "left";
    g.fillText(PINOS_A[i], 0, 0);
    g.restore();
  }
  g.font = `700 ${0.55 * P}px Arial, sans-serif`;
  g.textAlign = "center";
  texto(g, "NodeMCU", px(-4.4), pz(-2.1));
  return textura(c);
}

function texturaModulo() {
  const P = 64;
  const [c, g] = tela(9.4 * P, 6.3 * P);
  g.fillStyle = "#101216";
  g.fillRect(0, 0, c.width, c.height);
  // antena em zigue-zague (fim do módulo, +x)
  g.strokeStyle = "#c9a24c";
  g.lineWidth = 0.22 * P;
  g.beginPath();
  const x0 = 6.6 * P, x1 = 8.9 * P;
  g.moveTo(x0, 0.6 * P);
  for (let i = 0; i < 6; i++) {
    const z = (0.6 + i * 0.95) * P;
    g.lineTo(i % 2 ? x0 : x1, z);
    g.lineTo(i % 2 ? x0 : x1, z + 0.95 * P);
  }
  g.stroke();
  return textura(c);
}

function texturaBlindagem() {
  const P = 64;
  const [c, g] = tela(5.9 * P, 4.7 * P);
  g.fillStyle = "#c9ced6";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#6b727c";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${0.62 * P}px Arial, sans-serif`;
  texto(g, "ESP8266MOD", c.width / 2, c.height * 0.58);
  g.font = `600 ${0.42 * P}px Arial, sans-serif`;
  texto(g, "ESP-12E · Wi-Fi", c.width / 2, c.height * 0.36);
  return textura(c);
}

export function criarESP() {
  const g = new THREE.Group();
  const cx = -23, L = 18.9, Wd = 10.24, BASE = 1.0, PCB = 0.63, T = BASE + PCB;
  const preto = mat("#15171b", { rough: 0.6 });
  const met = metal();
  // barras de pinos (plástico preto sob a placa)
  for (const z of [-4.5, 4.5]) g.add(em(caixa(15, BASE, 0.95, preto), cx, BASE / 2, z));
  // pinos sob as barras: ficam dentro dos furos e aparecem quando a placa sai
  const pinoOuro = ouro();
  for (let i = 0; i < 15; i++) for (const z of [-4.5, 4.5]) g.add(em(caixa(0.2, 1.0, 0.2, pinoOuro), cx - 7 + i, -0.5, z));
  const borda = mat("#132038");
  const topoPcb = mat("#ffffff", { rough: 0.55, extra: { map: texturaESP(L, Wd) } });
  g.add(em(caixaFace(L, PCB, Wd, borda, topoPcb, TOPO), cx, BASE + PCB / 2, 0));
  // micro-USB (lado −x)
  g.add(em(caixa(2.4, 1.05, 3.0, met), cx - L / 2 + 0.5, T + 0.52, 0));
  // CP2102 e regulador AMS1117
  g.add(em(caixa(2.0, 0.35, 2.0, preto), cx - 4.2, T + 0.17, 0));
  g.add(em(caixa(2.5, 0.55, 1.4, preto), cx - 6.9, T + 0.27, -2.6));
  g.add(em(caixa(2.5, 0.14, 0.8, met), cx - 6.9, T + 0.07, -3.55));
  // botões RST e FLASH ao lado do USB
  for (const z of [-2.75, 2.75]) {
    g.add(em(caixa(1.5, 0.45, 1.5, met), cx - 7.9, T + 0.22, z));
    g.add(em(cil(0.45, 0.4, preto, 10), cx - 7.9, T + 0.62, z));
  }
  // módulo ESP-12E: placa preta + blindagem metálica + antena
  const mod = mat("#ffffff", { rough: 0.5, extra: { map: texturaModulo() } });
  const modL = mat("#101216");
  const mx = cx + L / 2 - 4.7;
  g.add(em(caixaFace(9.4, 0.3, 6.3, modL, mod, TOPO), mx, T + 0.15, 0));
  const blind = mat("#ffffff", { rough: 0.35, metal: 0.3, extra: { map: texturaBlindagem() } });
  g.add(em(caixaFace(5.9, 0.95, 4.7, met, blind, TOPO), mx - 4.7 + 0.3 + 2.95, T + 0.3 + 0.47, 0));
  // LED azul do módulo
  const azul = mat("#4aa3ff", { extra: { emissive: new THREE.Color("#4aa3ff"), emissiveIntensity: 0.9 } });
  g.add(em(caixa(0.45, 0.22, 0.3, azul), mx + 1.8, T + 0.4, 2.7));
  return g;
}

// ---------- DHT11 (módulo de 3 pinos em pé: VCC, DATA, GND nas colunas 37..39, linha f) ----------

function texturaGrade() {
  const [c, g] = tela(240, 290);
  g.fillStyle = "#4f9ff0";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#1e4f8c";
  const cols = 5, lins = 6;
  for (let i = 0; i < cols; i++) {
    for (let k = 0; k < lins; k++) {
      g.fillRect(24 + i * 41, 22 + k * 38 + (i % 2) * 8, 28, 20);
    }
  }
  return textura(c);
}

export function criarDHT11() {
  const g = new THREE.Group();
  const x0 = xCol(38), z0 = LINHA.f;
  const met = metal(), preto = mat("#15171b");
  for (const c of [37, 38, 39]) g.add(em(caixa(0.2, 2.1, 0.2, met), xCol(c), 0.15, z0));
  g.add(em(caixa(3.0, 0.8, 0.85, preto), x0, 0.75, z0));
  const pcb = mat("#1b3d75");
  g.add(em(caixa(5.6, 6.4, 0.55, pcb), x0, 1.15 + 3.2, z0));
  const corpo = mat("#5aa7f2", { rough: 0.6 });
  const grade = mat("#ffffff", { rough: 0.6, extra: { map: texturaGrade() } });
  g.add(em(caixaFace(4.7, 5.5, 2.0, corpo, grade, TRAS), x0, 1.15 + 0.5 + 2.75, z0 - 0.275 - 1.0));
  // LED de energia do módulo e resistor de pull-up (SMD)
  const verm = mat("#ff4d5e", { extra: { emissive: new THREE.Color("#ff4d5e"), emissiveIntensity: 0.8 } });
  g.add(em(caixa(0.35, 0.25, 0.2, verm), x0 - 2.2, 1.6, z0 - 0.35));
  g.add(em(caixa(0.6, 0.3, 0.2, preto), x0 + 2.1, 1.6, z0 - 0.35));
  return g;
}

// ---------- LED de 5 mm (ânodo na coluna c, cátodo em c+1, linha f) ----------

export function criarLED(colAnodo, cor) {
  const g = new THREE.Group();
  const z = LINHA.f, xa = xCol(colAnodo), xc = xa + 1, xm = xa + 0.5;
  const met = metal();
  g.add(em(cil(0.11, 2.25, met, 6), xa, 0.22, z));
  g.add(em(cil(0.11, 2.25, met, 6), xc, 0.22, z));
  const lente = mat(cor, {
    rough: 0.25,
    extra: { emissive: new THREE.Color(cor), emissiveIntensity: 0.35, transparent: true, opacity: 0.86 },
  });
  lente.userData.lente = true;
  g.add(em(cil(1.12, 0.38, lente, 16), xm, 1.35 + 0.19, z));
  g.add(em(cil(0.98, 2.0, lente, 16), xm, 1.73 + 1.0, z));
  const domo = new THREE.Mesh(new THREE.SphereGeometry(0.98, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2), lente);
  g.add(em(domo, xm, 3.73, z));
  // bigorna e poste internos (escuros, aparecem pela lente)
  const dentro = mat("#4b4f57", { rough: 0.5 });
  g.add(em(caixa(0.5, 1.4, 0.18, dentro), xm - 0.28, 2.3, z));
  g.add(em(caixa(0.22, 1.1, 0.18, dentro), xm + 0.32, 2.2, z));
  return g;
}

// ---------- resistor 220 Ω (vermelho, vermelho, marrom, ouro) deitado entre duas colunas ----------

export function criarResistor(colA, colB, linha) {
  const g = new THREE.Group();
  const z = LINHA[linha], xa = xCol(colA), xb = xCol(colB), xm = (xa + xb) / 2, y = 1.0;
  const met = metal();
  g.add(em(cilX(0.09, xb - xa, met, 6), xm, y, z));
  for (const x of [xa, xb]) g.add(em(cil(0.09, y + 0.9, met, 6), x, (y - 0.9) / 2, z));
  const bege = mat("#d9c39a", { rough: 0.6 });
  g.add(em(cilX(0.4, 1.4, bege), xm, y, z));
  for (const s of [-1, 1]) g.add(em(cilX(0.48, 0.55, bege), xm + s * 0.85, y, z));
  const faixas = [
    [-0.95, "#c62f2f", 0.5],
    [-0.45, "#c62f2f", 0.42],
    [-0.05, "#6b3b1f", 0.42],
    [0.95, "#d6aa45", 0.5],
  ];
  for (const [dx, cor, r] of faixas) g.add(em(cilX(r + 0.01, 0.18, mat(cor, { rough: 0.5 })), xm + dx, y, z));
  return g;
}

// ---------- buzzer ativo de 12 mm (+ em g55, − em g58) ----------

export function criarBuzzer() {
  const g = new THREE.Group();
  const x0 = (xCol(55) + xCol(58)) / 2, z0 = LINHA.g;
  const preto = mat("#1c1e23", { rough: 0.55 });
  const met = metal();
  for (const c of [55, 58]) g.add(em(cil(0.1, 1.3, met, 6), xCol(c), -0.25, z0));
  g.add(em(cil(2.36, 3.5, preto, 22), x0, 0.35 + 1.75, z0));
  g.add(em(cil(1.95, 0.12, mat("#2a2d33"), 22), x0, 3.91, z0));
  g.add(em(cil(0.42, 0.14, mat("#07080a"), 10), x0, 3.98, z0));
  // marca "+" do lado do pino positivo
  const branco = mat("#e6e9ee");
  g.add(em(caixa(0.7, 0.05, 0.16, branco), x0 - 1.3, 3.88, z0 - 0.9));
  g.add(em(caixa(0.16, 0.05, 0.7, branco), x0 - 1.3, 3.88, z0 - 0.9));
  return g;
}

// ---------- botão táctil 6×6 sobre o canal central (pernas em e/f 47 e 49) ----------

export function criarBotao() {
  const g = new THREE.Group();
  const x0 = xCol(48), z0 = 0;
  const corpo = mat("#2b2e34", { rough: 0.6 });
  const met = metal();
  for (const cx of [47, 49]) {
    for (const s of [-1, 1]) {
      g.add(em(caixa(0.26, 1.85, 0.12, met), xCol(cx), 0.02, s * 1.5));
      g.add(em(caixa(0.26, 0.12, 0.42, met), xCol(cx), 0.9, s * 1.32));
    }
  }
  g.add(em(caixa(2.4, 1.15, 2.4, corpo), x0, 0.25 + 0.57, z0));
  g.add(em(caixa(2.5, 0.12, 2.5, met), x0, 1.45, z0));
  g.add(em(cil(0.72, 0.75, mat("#16181c"), 14), x0, 1.5 + 0.37, z0));
  return g;
}

// ---------- PIR HC-SR501 fora da protoboard (atrás, do lado +z), sobre espaçadores ----------
// Pinos (VCC, OUT, GND) saem na frente da placa, virados para a protoboard.

export function criarPIR() {
  const g = new THREE.Group();
  const cx = 11, cz = 22, Y = -0.3; // centro da placa verde
  const verde = mat("#1f6e3e", { rough: 0.6 });
  const cinza = mat("#3a3f47", { rough: 0.5 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(em(cil(0.38, 2.8, cinza, 8), cx + sx * 5.6, MESA + 1.4, cz + sz * 4.0));
  }
  g.add(em(caixa(12.6, 0.6, 9.4, verde), cx, Y, cz));
  // lente de Fresnel: moldura quadrada + domo facetado
  const lente = mat("#eef1f4", { rough: 0.55 });
  g.add(em(caixa(9.3, 0.8, 9.3, lente), cx, Y + 0.7, cz));
  const domo = new THREE.Mesh(new THREE.SphereGeometry(4.25, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), lente);
  domo.scale.y = 0.92;
  g.add(em(domo, cx, Y + 1.1, cz));
  // potenciômetros (sensibilidade e tempo) e jumper de modo, embaixo
  const laranja = mat("#f08a2a", { rough: 0.5 });
  for (const sx of [-1, 1]) g.add(em(caixa(1.3, 0.7, 1.3, laranja), cx + sx * 4.3, Y - 0.65, cz - 2.6));
  g.add(em(caixa(0.9, 0.6, 1.6, mat("#e7c43a")), cx - 4.4, Y - 0.6, cz + 2.4));
  // barra de pinos em ângulo
  const preto = mat("#15171b");
  const zFrente = cz - 4.7; // borda virada para a protoboard
  g.add(em(caixa(3.2, 0.9, 0.9, preto), cx, Y - 0.75, zFrente + 0.45));
  const met = metal();
  const pinos = {};
  ["vcc", "out", "gnd"].forEach((nome, i) => {
    const x = cx - 1 + i;
    g.add(em(caixa(0.18, 0.18, 1.2, met), x, Y - 0.75, zFrente - 0.4));
    pinos[nome] = {
      p: new THREE.Vector3(x, Y - 0.75, zFrente - 0.2),
      d: new THREE.Vector3(0, 0, -1),
      dw: new THREE.Vector3(0, 0.75, -0.66).normalize(),
    };
  });
  return { grupo: g, pinos };
}

// ---------- servo SG90 fora da protoboard (à direita), em pé sobre a mesa ----------

export function criarServo() {
  const g = new THREE.Group();
  const cx = 39.5, cz = -4, W = 4.65, C = 8.75, H = 8.9;
  const azul = mat("#2f6fd6", { rough: 0.35, extra: { transparent: true, opacity: 0.9 } });
  g.add(em(caixa(W, H, C, azul), cx, MESA + H / 2, cz));
  g.add(em(caixa(W, 0.95, 12.8, azul), cx, MESA + 6.2, cz));
  // furos das abas
  const escuro = mat("#0d1a33");
  for (const s of [-1, 1]) g.add(em(cil(0.45, 0.97, escuro, 8), cx, MESA + 6.2, cz + s * 5.6));
  // torre da engrenagem, eixo e braço (horn)
  const zEixo = cz - C / 2 + 2.32;
  g.add(em(cil(2.32, 1.5, azul, 18), cx, MESA + H + 0.75, zEixo));
  g.add(em(cil(1.2, 1.1, azul, 14), cx, MESA + H + 0.55, zEixo + 2.4));
  const branco = mat("#f2f4f7", { rough: 0.5 });
  g.add(em(cil(0.5, 0.6, branco, 10), cx, MESA + H + 1.8, zEixo));
  const horn = new THREE.Group();
  horn.add(em(cil(1.05, 0.55, branco, 14), 0, 0, 0));
  horn.add(em(caixa(1.15, 0.5, 8.0, branco), 0, 0, 0));
  horn.add(em(caixa(5.8, 0.5, 1.05, branco), 0, 0, 0));
  horn.position.set(cx, MESA + H + 2.35, zEixo);
  horn.rotation.y = 0.45;
  g.add(horn);
  // saída do cabo (lado da protoboard, embaixo)
  const xs = cx - W / 2;
  g.add(em(caixa(0.7, 1.0, 1.8, azul), xs - 0.35, MESA + 1.3, cz + 2.6));
  const fios = {};
  ["gnd", "vcc", "sig"].forEach((nome, i) => {
    fios[nome] = {
      p: new THREE.Vector3(xs - 0.7, MESA + 1.3, cz + 2.6 + (i - 1) * 0.42),
      d: new THREE.Vector3(-1, 0, 0),
      dw: new THREE.Vector3(-0.55, 0.83, 0).normalize(),
      semCapa: true,
    };
  });
  return { grupo: g, fios };
}

// ---------- tampo escuro sob a montagem e sombra de contato ----------

export function criarBase(x0, z0, w, d) {
  const g = new THREE.Group();
  const P = 16;
  const [c, ctx] = tela(w * P, d * P);
  ctx.fillStyle = "#0b111b";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "rgba(94,231,255,0.07)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x * P, 0);
    ctx.lineTo(x * P, c.height);
    ctx.stroke();
  }
  for (let z = 0; z <= d; z += 5) {
    ctx.beginPath();
    ctx.moveTo(0, z * P);
    ctx.lineTo(c.width, z * P);
    ctx.stroke();
  }
  const lado = mat("#0a0f18", { rough: 0.9 });
  const topo = mat("#ffffff", { rough: 0.9, extra: { map: textura(c) } });
  const placa = em(caixaFace(w, 1.6, d, lado, topo, TOPO), x0, MESA - 0.8, z0);
  placa.userData.borda = true;
  g.add(placa);
  return g;
}

export function criarSombra(x, z, w, d) {
  const P = 8, m = 6;
  const [c, g] = tela((w + m * 2) * P, (d + m * 2) * P);
  g.filter = `blur(${2.2 * P}px)`;
  g.fillStyle = "rgba(0,0,0,0.85)";
  g.fillRect(m * P, m * P, w * P, d * P);
  const t = textura(c);
  const plano = new THREE.Mesh(
    new THREE.PlaneGeometry(w + m * 2, d + m * 2),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }),
  );
  plano.rotation.x = -Math.PI / 2;
  plano.position.set(x, MESA + 0.02, z);
  plano.userData.semAresta = true;
  return plano;
}
