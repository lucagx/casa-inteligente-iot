# Texturas fotográficas e modelos de natureza

## Texturas

As do [Poly Haven](https://polyhaven.com) têm licença **CC0** (domínio público; não exige atribuição, mas fica o crédito).
1K em JPG: cor (`_diff`), normal OpenGL (`_nor_gl`), rugosidade (`_rough`) e, nas do chão, oclusão (`_ao`).
Carregadas por `TX.photoMaps()` em `app-3d/public/js/textures.js` e aplicadas em `app-3d/public/js/world.js`.

| Arquivos | Textura | Autoria | Onde |
|---|---|---|---|
| `concrete_floor_worn_001_*` | [Concrete Floor Worn 001](https://polyhaven.com/a/concrete_floor_worn_001) | Dimitrios Savva (fotografia), Rico Cilliers (processamento) | piso da garagem |
| `concrete_tiles_02_*` | [Concrete Tiles 02](https://polyhaven.com/a/concrete_tiles_02) | Charlotte Baglioni | caminho até a porta |
| `oak_wood_planks_*` | [Oak Wood Planks](https://polyhaven.com/a/oak_wood_planks) | Dimitrios Savva | piso interno (térreo e andar de cima) |
| `teak_veneer_*` | [Teak Veneer](https://polyhaven.com/a/teak_veneer) | Jenelle van Heerden | deck da piscina e deck do terraço |
| `japanese_cedar_planks_*` | [Japanese Cedar Planks](https://polyhaven.com/a/japanese_cedar_planks) | Charlotte Baglioni (escaneamento), Rico Cilliers (processamento) | ripas verticais da fachada |
| `grass002_*` | Grass002, do pacote [10 Seamless PBR Grass Textures](https://www.cgtrader.com/free-3d-models/textures/natural-textures/10-seamless-pbr-grass-textures) (CGTrader, gratuito) | — | verde do chão do terreno (perfil leve: o chão inteiro) |
| `dirt_ground_*` | Dirt Ground, do [Grass Pack](https://www.cgtrader.com/free-3d-models/plant/grass/grass-pack-729515b2-08cf-434b-a6cd-5e63580ba889) (CGTrader, gratuito) | — | terra do chão sob o prado |

As duas da CGTrader são modelos gratuitos com a licença padrão do site (Royalty Free: uso permitido em projetos, sem
redistribuir o arquivo original como produto). Conferir a licença na página de cada item antes da entrega.

## Modelos 3D (`app-3d/public/modelos/natureza/`)

Extraídos e otimizados dos originais em `docs/modelos-ground/` (fora do git): malhas comprimidas com meshopt, texturas WebP 512 px.

| Arquivo | Modelo | Autoria e licença | Onde |
|---|---|---|---|
| `prado.glb` + `prado.json` | [Grass Pack](https://www.cgtrader.com/free-3d-models/plant/grass/grass-pack-729515b2-08cf-434b-a6cd-5e63580ba889) — o prado de demonstração (touceiras, grama seca, trevo com flor, margaridas, cascalho) e a distribuição das instâncias | CGTrader, gratuito (Royalty Free) | gramado da ilha inteira |
| `circulos.glb` | [Grass Patches - Circle](https://sketchfab.com/3d-models/grass-patches-circle-662f27b14f994054bfdf841317dee7f8) | brandon_grey (Sketchfab), **CC BY 4.0** — exige atribuição | touceiras perto das árvores |
| `pedras/rock_moss_set_01.glb`, `rock_moss_set_02.glb`, `rock_09.glb` | [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01), [Rock Moss Set 02](https://polyhaven.com/a/rock_moss_set_02), [Rock 09](https://polyhaven.com/a/rock_09) | Poly Haven, **CC0** | grupos de pedras no gramado |
| `plantas/*.glb` (shrub_01/02/04, fern_02, calathea_orbifolia_01, anthurium_botany_01, periwinkle_plant, flower_gazania, flower_ursinia) | modelos de plantas do [Poly Haven](https://polyhaven.com/models/nature) | Poly Haven, **CC0** | sebes, arbustos soltos e canteiros |
| `arvores/pine_sapling_small.glb` | [Pine Sapling Small](https://polyhaven.com/a/pine_sapling_small) | Poly Haven, **CC0** | pinheirinhos |
| `arvores/ilha_a.glb`, `ilha_b.glb` | [Low Poly Tree Scene Free](https://sketchfab.com/3d-models/low-poly-tree-scene-free-89daa5e21f0d4f08a59dba0d566e88bd) (duas árvores separadas da cena) | Nicholas-3D (Sketchfab), **CC BY 4.0** — exige atribuição | árvores |
| `arvores/bordo.glb` | [Maple Tree](https://sketchfab.com/3d-models/maple-tree-b5e945e7abcc471da6547c04e314774c) | evolveduk (Sketchfab), **CC BY 4.0** — exige atribuição | árvores |
| `arvores/carvalhao_1.glb` | [Mighty Oak Trees](https://sketchfab.com/3d-models/mighty-oak-trees-4f6ab5594a8a415aba3f958682b9ced5) (uma árvore separada e simplificada) | Jagobo (Sketchfab), **CC BY 4.0** — exige atribuição | árvore grande do fundo |
