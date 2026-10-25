// V8: separa árvores de arquivos com várias (Sketchfab) em um .glb por árvore: só os nós escolhidos, simplificado,
// texturas WebP e meshopt. A centralização e a escala ficam para a cena (world.js).
// Requer: cd app-3d && npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
// Uso (em app-3d): node --max-old-space-size=8000 ferramentas/separar-arvores.mjs <saida/>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress, meshopt, metalRough } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import path from 'path';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const G = '../docs/modelos-ground/', saida = process.argv[2];

// [arquivo de saída, arquivo de origem, nós a manter (vazio = todos), razão da simplificação]
const LISTA = [
  ['bordo', 'maple_tree.glb', [], 0.7],
  ['carvalho_p', 'oak_trees.glb', ['Treesmall'], 1],
  ['carvalho_m', 'oak_trees.glb', ['Treemedium'], 1],
  ['carvalho_g', 'oak_trees.glb', ['treelarge'], 1],
  ['carvalhao_1', 'mighty_oak_trees.glb', ['structure_2', 'foliage_3'], 0.35],
  ['carvalhao_2', 'mighty_oak_trees.glb', ['structure.001_4', 'foliage.001_5'], 0.45],
  ['carvalhao_3', 'mighty_oak_trees.glb', ['structure.002_6', 'foliage.002_7'], 0.35],
  ['ilha_a', 'low_poly_tree_scene_free.glb', ['Bark.001_2669'], 1],
  ['ilha_b', 'low_poly_tree_scene_free.glb', ['Bark_2671'], 1],
  ['animada', 'tree_animate.glb', [], 1],
];

for (const [nome, arq, nos, razao] of LISTA) {
  const doc = await io.read(G + arq);
  const r = doc.getRoot();
  if (nos.length) {
    const cena = doc.createScene('arvore');
    for (const n of nos) {
      const no = r.listNodes().find((x) => x.getName() === n);
      if (!no) throw new Error(`${arq}: sem o nó ${n}`);
      const m = no.getWorldMatrix();
      no.getParentNode()?.removeChild(no);
      for (const s of r.listScenes()) if (s !== cena) s.removeChild(no);
      no.setMatrix(m);
      cena.addChild(no);
    }
    for (const s of r.listScenes()) if (s !== cena) s.dispose();
    r.setDefaultScene(cena);
  }
  await doc.transform(metalRough(), prune(), dedup(), weld(),
    ...(razao < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio: razao, error: 0.01 })] : []),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }), prune(), meshopt({ encoder: MeshoptEncoder }));
  let t = 0;
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3;
  await io.write(path.join(saida, nome + '.glb'), doc);
  console.log(nome, Math.round(t), 'triângulos');
}
