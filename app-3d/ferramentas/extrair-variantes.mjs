// V8: extrai variantes (malhas) de um .glb para um .glb leve: um nó por variante, na origem; simplifica, WebP 512, meshopt.
// Requer as mesmas dependências de extrair-prado.mjs. Uso (em app-3d):
//   node ferramentas/extrair-variantes.mjs ../docs/modelos-ground/grass_patches_-_circle.glb public/modelos/natureza/circulos.glb 0.12 [nomes das malhas...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress, meshopt, getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const [entrada, saida, razao, ...nomes] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(entrada);
const root = doc.getRoot();
const escolhidas = nomes.length ? nomes.map((n) => root.listMeshes().find((m) => m.getName() === n) || (() => { throw new Error('sem malha ' + n); })()) : root.listMeshes();
const cena = doc.createScene('variantes');
escolhidas.forEach((m, i) => cena.addChild(doc.createNode(nomes[i] || m.getName() || 'v' + i).setMesh(m)));
for (const s of root.listScenes()) if (s !== cena) s.dispose();
for (const n of root.listNodes()) if (n.getParentNode() === null && !cena.listChildren().includes(n)) n.dispose();
root.setDefaultScene(cena);
await doc.transform(prune(), dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(razao), error: 0.01 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }), prune(), meshopt({ encoder: MeshoptEncoder }));
for (const n of cena.listChildren()) {
  let t = 0; for (const p of n.getMesh().listPrimitives()) t += p.getIndices().getCount() / 3;
  const b = getBounds(n); console.log(n.getName(), Math.round(t), 'tri', b.min.map((v) => v.toFixed(2)).join(','), '→', b.max.map((v) => v.toFixed(2)).join(','));
}
await io.write(saida, doc);
