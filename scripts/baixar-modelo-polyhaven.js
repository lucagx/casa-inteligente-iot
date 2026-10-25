// Requer: cd app-3d && npm i --no-save @gltf-transform/cli @gltf-transform/functions meshoptimizer sharp
// Baixa um modelo do Poly Haven (glTF 1K + texturas) e gera um .glb otimizado (meshopt, textura 512 WebP, simplificado).
// uso: node baixar.js <id> <razaoSimplificar>
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const id = process.argv[2], razao = process.argv[3] || "0.1";
const raiz = path.join(__dirname, "..", "docs", "modelos-polyhaven-trabalho"); // bruto/ e glb/ ficam aqui
const pasta = path.join(raiz, "bruto", id);
(async () => {
  const f = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const g = f.gltf["1k"].gltf;
  fs.mkdirSync(pasta, { recursive: true });
  const baixa = async (url, destino) => {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const r = await fetch(url);
    fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  };
  await baixa(g.url, path.join(pasta, path.basename(g.url)));
  for (const [rel, info] of Object.entries(g.include)) await baixa(info.url, path.join(pasta, rel));
  const entrada = path.join(pasta, path.basename(g.url));
  fs.mkdirSync(path.join(raiz, "glb"), { recursive: true });
  const saida = path.join(raiz, "glb", `${id}.glb`);
  execSync(`npx gltf-transform optimize "${entrada}" "${saida}" --compress meshopt --texture-compress webp --texture-size 512 --simplify true --simplify-ratio ${razao} --simplify-error 0.02`,
    { cwd: path.join(__dirname, "..", "app-3d"), stdio: "pipe" });
  const info = execSync(`npx gltf-transform inspect "${saida}" --format csv`, { cwd: path.join(__dirname, "..", "app-3d") }).toString();
  const orig = execSync(`npx gltf-transform inspect "${entrada}" --format csv`, { cwd: path.join(__dirname, "..", "app-3d") }).toString();
  const tri = (csv) => { const m = csv.match(/\nscene[^\n]*|^[^\n]*\n/); return csv; };
  fs.writeFileSync(path.join(raiz, "glb", `${id}.txt`), "ORIGINAL\n" + orig + "\nOTIMIZADO\n" + info);
  console.log(id, Math.round(fs.statSync(saida).size / 1024) + " KB");
})().catch((e) => { console.error(id, "ERRO", e.message.slice(0, 200)); process.exit(1); });
