// npm run wisdom -- <REF_129_PREVIEW folder>: GLB (meshopt, 2048 px WebP), manifest and compositor → public/wisdom.
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const MODEL = 'REF_129_scroll.glb';
const OUTPUT = 'public/wisdom';
const WALL_BLUR = 8;

const source = process.argv[2];
if (!source) throw new Error('Pass the KELV_REF129_PREVIEW folder');
const assets = path.join(source, 'assets');

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(path.join(assets, MODEL));

// The light nodes are empty but animated; their per-frame power is in the manifest, so the copy in extras goes.
for (const node of document.getRoot().listNodes()) {
  const { areaLight, ...extras } = node.getExtras();
  if (areaLight) node.setExtras(extras);
}
// The wall's glow is a 500 × 333 map with blocky columns; smoothed and kept lossless (WebP adds blocks).
const wall = document
  .getRoot()
  .listTextures()
  .find((texture) => texture.getName() === 'Wall_emission');
if (!wall) throw new Error('Wall_emission missing');
wall.setImage(await sharp(wall.getImage()).resize(1000, 666, { kernel: 'cubic' }).blur(WALL_BLUR).png().toBuffer());

await document.transform(
  prune({ keepLeaves: true }),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 90, pattern: /^K\d_/ }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
document.createExtension(EXTMeshoptCompression).setRequired(true);

await mkdir(OUTPUT, { recursive: true });
await io.write(path.join(OUTPUT, 'wisdom.glb'), document);
for (const file of ['scene_manifest.json', 'compositor.json'])
  await copyFile(path.join(assets, file), path.join(OUTPUT, file));
console.log(`${source} → ${OUTPUT}`);
