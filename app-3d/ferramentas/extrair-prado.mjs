// V8: extrai o prado de demonstração do Grass.glb (Grass Pack, CGTrader) para public/modelos/natureza/prado.glb + prado.json.
// Requer: cd app-3d && npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
// Uso (em app-3d): node --max-old-space-size=8000 ferramentas/extrair-prado.mjs ../docs/modelos-ground/Grass.glb public/modelos/natureza/prado 0.03 0.3
//   (razão e erro da simplificação; as folhas são pedaços soltos, então o ganho é pequeno)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const [entrada, saida] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(entrada);
const r = doc.getRoot();
const X0 = -8.51, X1 = 4.34, Z0 = -10.14, Z1 = 2.82, CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;
// matriz de mundo → [x, y, z, qx, qy, qz, qw, sx, sy, sz]
function decompor(m) {
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const r00 = m[0] / sx, r01 = m[4] / sy, r02 = m[8] / sz, r10 = m[1] / sx, r11 = m[5] / sy, r12 = m[9] / sz, r20 = m[2] / sx, r21 = m[6] / sy, r22 = m[10] / sz;
  const tr = r00 + r11 + r22; let qx, qy, qz, qw;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; qw = 0.25 * s; qx = (r21 - r12) / s; qy = (r02 - r20) / s; qz = (r10 - r01) / s; }
  else if (r00 > r11 && r00 > r22) { const s = Math.sqrt(1 + r00 - r11 - r22) * 2; qw = (r21 - r12) / s; qx = 0.25 * s; qy = (r01 + r10) / s; qz = (r02 + r20) / s; }
  else if (r11 > r22) { const s = Math.sqrt(1 + r11 - r00 - r22) * 2; qw = (r02 - r20) / s; qx = (r01 + r10) / s; qy = 0.25 * s; qz = (r12 + r21) / s; }
  else { const s = Math.sqrt(1 + r22 - r00 - r11) * 2; qw = (r10 - r01) / s; qx = (r02 + r20) / s; qy = (r12 + r21) / s; qz = 0.25 * s; }
  return [m[12], m[13], m[14], qx, qy, qz, qw, sx, sy, sz];
}
const inst = new Map();
for (const n of r.listNodes()) {
  const m = n.getMesh(); if (!m || m.getName() === 'Plane.006') continue;
  const w = n.getWorldMatrix();
  if (w[12] < X0 || w[12] > X1 || w[14] < Z0 || w[14] > Z1) continue;
  if (!inst.has(m)) inst.set(m, []);
  const d = decompor(w); d[0] -= CX; d[2] -= CZ;
  inst.get(m).push(d.map((v) => +v.toFixed(4)));
}
const json = {};
const cena = doc.createScene('prado');
for (const [m, lista] of inst) { const nome = m.getName(); json[nome] = lista; cena.addChild(doc.createNode(nome).setMesh(m)); console.log(nome, lista.length, 'instâncias'); }
for (const s of r.listScenes()) if (s !== cena) s.dispose();
for (const n of r.listNodes()) if (!cena.listChildren().includes(n)) n.dispose();
r.setDefaultScene(cena);
await doc.transform(prune(), dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(process.argv[4] || 0.06), error: Number(process.argv[5] || 0.03), lockBorder: false }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }), prune(), meshopt({ encoder: MeshoptEncoder }));
let total = 0;
for (const n of cena.listChildren()) { let t = 0; for (const p of n.getMesh().listPrimitives()) t += p.getIndices().getCount() / 3; const k = json[n.getName()].length; total += t * k; console.log('  ', n.getName(), Math.round(t), 'tri ×', k); }
console.log('triângulos do prado (13×13 m):', Math.round(total));
await io.write(saida + '.glb', doc);
fs.writeFileSync(saida + '.json', JSON.stringify({ tamanho: [X1 - X0, Z1 - Z0], instancias: json }));
