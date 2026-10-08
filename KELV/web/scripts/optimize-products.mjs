// npm run products -- <folder with K1_COOL_Foam.glb, K2_CALM_Serum.glb, K3_SEAL_Cream.glb>: meshopt, 2048 px WebP.
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const PRODUCTS = ['K1_COOL_Foam', 'K2_CALM_Serum', 'K3_SEAL_Cream'];
const OUTPUT = 'public/products';

const source = process.argv[2];
if (!source) throw new Error('Pass the folder with the three product GLBs');

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

for (const name of PRODUCTS) {
  const document = await io.read(path.join(source, `${name}.glb`));
  await document.transform(
    prune(),
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 90 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  document.createExtension(EXTMeshoptCompression).setRequired(true);
  const output = path.join(OUTPUT, `${name}.glb`);
  await io.write(output, document);
  console.log(`${name} → ${output}`);
}
