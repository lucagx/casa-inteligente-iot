// Fios da montagem: jumpers dupont (arcos com capa preta nas pontas) para os sinais e
// jumpers rígidos rentes à placa para alimentação e GND. Cada fio pertence a uma peça (destaque junto).
import * as THREE from "three";
import { furo, mat, UP } from "./pecas.js";

const CAPA = 2.2; // altura da capa preta do dupont
const COR = {
  vermelho: "#e5484d",
  preto: "#30343c",
  verde: "#3fbf7f",
  amarelo: "#f2cc4a",
  azul: "#4d9de0",
  roxo: "#a77bdb",
  branco: "#e6e8ec",
  laranja: "#f0912e",
  marrom: "#9a5a32",
  marromServo: "#6e4127",
};

// ponta num furo: capa em pé, fio sai para cima
const noFuro = (c, l) => ({ p: furo(c, l), d: UP.clone() });

function capa(ponta, materialCapa, materialPino) {
  const g = new THREE.Group();
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.8, CAPA, 0.8), materialCapa);
  corpo.position.y = CAPA / 2;
  g.add(corpo);
  const pino = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), materialPino);
  pino.position.y = -0.3;
  pino.userData.semAresta = true;
  g.add(pino);
  g.quaternion.setFromUnitVectors(UP, ponta.d);
  g.position.copy(ponta.p);
  return g;
}

// jumper dupont entre duas pontas {p, d, dw?, semCapa?}
export function dupont(a, b, cor, raio = 0.26) {
  const g = new THREE.Group();
  const mCapa = mat("#1b1e23", { rough: 0.55 });
  const mPino = mat("#c4cad2", { rough: 0.4, metal: 0.35 });
  const inicio = (q) => (q.semCapa ? q.p.clone() : q.p.clone().addScaledVector(q.d, CAPA));
  const p0 = inicio(a), p3 = inicio(b);
  const dist = p0.distanceTo(p3);
  const k = 1.2 + 0.1 * dist;
  const p1 = p0.clone().addScaledVector(a.dw || a.d, k);
  const p2 = p3.clone().addScaledVector(b.dw || b.d, k);
  const curva = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
  const tubo = new THREE.Mesh(
    new THREE.TubeGeometry(curva, Math.max(24, Math.round(dist * 2.2)), raio, 8, false),
    mat(cor, { rough: 0.5, flat: false }),
  );
  tubo.userData.semAresta = true;
  g.add(tubo);
  for (const q of [a, b]) if (!q.semCapa) g.add(capa(q, mCapa, mPino));
  return g;
}

// jumper rígido em U, deitado a 0,35 acima da placa
export function rigido(pa, pb, cor) {
  const g = new THREE.Group();
  const y = 0.35;
  const a1 = new THREE.Vector3(pa.x, y, pa.z), b1 = new THREE.Vector3(pb.x, y, pb.z);
  const caminho = new THREE.CurvePath();
  caminho.add(new THREE.LineCurve3(new THREE.Vector3(pa.x, -0.4, pa.z), a1));
  caminho.add(new THREE.LineCurve3(a1, b1));
  caminho.add(new THREE.LineCurve3(b1, new THREE.Vector3(pb.x, -0.4, pb.z)));
  const metal = new THREE.Mesh(
    new THREE.TubeGeometry(caminho, 48, 0.13, 6, false),
    mat("#c4cad2", { rough: 0.4, metal: 0.35, flat: false }),
  );
  metal.userData.semAresta = true;
  g.add(metal);
  // isolamento colorido só no trecho deitado, com folga nas pontas
  const dir = b1.clone().sub(a1);
  const len = dir.length();
  dir.normalize();
  const capaIso = new THREE.LineCurve3(a1.clone().addScaledVector(dir, 0.3), b1.clone().addScaledVector(dir, -0.3));
  const iso = new THREE.Mesh(
    new THREE.TubeGeometry(capaIso, 2, 0.27, 8, false),
    mat(cor, { rough: 0.5, flat: false }),
  );
  iso.userData.semAresta = true;
  if (len > 0.7) g.add(iso);
  return g;
}

// Toda a fiação da montagem atual. Devolve [{ peca, objeto }] (peca = null para fios gerais).
export function criarFios({ pir, servo }) {
  const lista = [];
  const J = (peca, cA, lA, cB, lB, cor) =>
    lista.push({ peca, objeto: dupont(noFuro(cA, lA), noFuro(cB, lB), cor) });
  const R = (peca, cA, lA, cB, lB, cor) => lista.push({ peca, objeto: rigido(furo(cA, lA), furo(cB, lB), cor) });

  // alimentação do NodeMCU: Vin e GND nos trilhos de trás (5 V), 3V3 e GND nos da frente (3,3 V)
  R("esp8266", 2, "a", 2, "t+", COR.vermelho);
  R("esp8266", 3, "a", 3, "t-", COR.preto);
  R("esp8266", 10, "j", 10, "b-", COR.preto);
  R("esp8266", 11, "j", 11, "b+", COR.vermelho);
  // GND comum: liga os dois trilhos negativos
  R(null, 61, "t-", 61, "b-", COR.preto);

  // sinais (arcos aninhados: o pino mais à direita vai para a peça mais próxima)
  J("led-porta", 16, "j", 20, "j", COR.verde); // D0
  R("led-porta", 25, "j", 25, "b-", COR.preto);
  J("led-luz", 15, "j", 28, "j", COR.amarelo); // D1
  R("led-luz", 33, "j", 33, "b-", COR.preto);
  J("dht11", 14, "j", 38, "j", COR.azul); // D2
  R("dht11", 37, "j", 37, "b+", COR.vermelho);
  R("dht11", 39, "j", 39, "b-", COR.preto);
  J("pir", 9, "j", 43, "j", COR.roxo); // D5
  J("botao", 8, "j", 47, "j", COR.branco); // D6
  R("botao", 49, "j", 49, "b-", COR.preto);
  J("servo", 7, "j", 52, "j", COR.laranja); // D7
  J("buzzer", 6, "j", 55, "j", COR.marrom); // D8
  R("buzzer", 58, "j", 58, "b-", COR.preto);

  // PIR (fora da placa): VCC no 5 V, OUT na coluna 43 (ligada ao D5), GND no trilho de trás
  lista.push({ peca: "pir", objeto: dupont(pir.vcc, noFuro(41, "t+"), COR.vermelho) });
  lista.push({ peca: "pir", objeto: dupont(pir.out, noFuro(43, "f"), COR.amarelo) });
  lista.push({ peca: "pir", objeto: dupont(pir.gnd, noFuro(44, "t-"), COR.preto) });

  // servo (fora da placa): marrom GND, vermelho 5 V, laranja sinal na coluna 52 (ligada ao D7)
  lista.push({ peca: "servo", objeto: dupont(servo.gnd, noFuro(62, "t-"), COR.marromServo, 0.18) });
  lista.push({ peca: "servo", objeto: dupont(servo.vcc, noFuro(63, "t+"), COR.vermelho, 0.18) });
  lista.push({ peca: "servo", objeto: dupont(servo.sig, noFuro(52, "f"), COR.laranja, 0.18) });

  return lista;
}

// pontos para os rótulos de apoio (trilhos e GND comum)
export const NOTAS = [
  { texto: "trilho 5 V · Vin", p: new THREE.Vector3(-27, 0.2, -12.2) },
  { texto: "trilho 3,3 V", p: new THREE.Vector3(-24, 0.2, 12.4) },
  { texto: "GND comum", p: new THREE.Vector3(29, 0.6, -12.4) },
];

// furos onde cada peça encaixa: aparecem marcados quando a peça sai da placa
const faixa = (c0, c1, l) => Array.from({ length: c1 - c0 + 1 }, (_, i) => [c0 + i, l]);
export const ENCAIXES = {
  esp8266: [...faixa(2, 16, "b"), ...faixa(2, 16, "i")],
  dht11: faixa(37, 39, "f"),
  "led-luz": [[32, "f"], [33, "f"], [28, "h"], [32, "h"]],
  "led-porta": [[24, "f"], [25, "f"], [20, "h"], [24, "h"]],
  buzzer: [[55, "g"], [58, "g"]],
  botao: [[47, "e"], [49, "e"], [47, "f"], [49, "f"]],
  pir: [[41, "t+"], [43, "f"], [44, "t-"]],
  servo: [[62, "t-"], [63, "t+"], [52, "f"]],
};
