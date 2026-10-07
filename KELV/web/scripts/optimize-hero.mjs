// Compresses the hero scene GLB for the web: meshopt geometry, 2048 px WebP textures and
// only the HERO_Full clip. gltf-transform has no KHR_animation_pointer support, so the K1
// light-up channels are carried through by the small extension below.
//
// Usage: npm run hero -- <path to HERO_130_animated.glb>
import { Extension, NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const POINTER = 'KHR_animation_pointer';
const MATERIAL_POINTER = /^\/materials\/(\d+)(\/.*)$/;
const CLIP = 'HERO_Full';
const OUTPUT = 'public/hero/hero.glb';

class AnimationPointer extends Extension {
  static EXTENSION_NAME = POINTER;
  extensionName = POINTER;
  targets = new Map();

  read(context) {
    const { json } = context.jsonDoc;
    const animations = this.document.getRoot().listAnimations();
    json.animations?.forEach((def, a) => {
      const channels = animations[a].listChannels();
      def.channels.forEach((channelDef, c) => {
        const pointer = channelDef.target.extensions?.[POINTER]?.pointer;
        if (!pointer) return;
        const [, index, rest] = pointer.match(MATERIAL_POINTER) ?? [];
        if (!index) throw new Error(`Unsupported animation pointer: ${pointer}`);
        this.targets.set(channels[c], { material: context.materials[Number(index)], rest });
      });
    });
    return this;
  }

  write(context) {
    const { json } = context.jsonDoc;
    const materials = this.document.getRoot().listMaterials();
    this.document.getRoot().listAnimations().forEach((animation, a) => {
      animation.listChannels().forEach((channel, c) => {
        const target = this.targets.get(channel);
        if (!target) return;
        const index = materials.indexOf(target.material);
        json.animations[a].channels[c].target = {
          path: 'pointer',
          extensions: { [POINTER]: { pointer: `/materials/${index}${target.rest}` } },
        };
      });
    });
    return this;
  }
}

const source = process.argv[2];
if (!source) throw new Error('Pass the path to HERO_130_animated.glb');

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([...ALL_EXTENSIONS, AnimationPointer])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const document = await io.read(source);
const pointer = document.createExtension(AnimationPointer);

for (const animation of document.getRoot().listAnimations()) {
  if (animation.getName() !== CLIP) animation.dispose();
}
const keep = [...pointer.targets.keys()].filter((channel) => !channel.isDisposed());
await document.transform(
  // Channels are left out on purpose: prune would drop the light-up channels, which have
  // no target node.
  prune({
    propertyTypes: [PropertyType.ANIMATION_SAMPLER, PropertyType.ACCESSOR, PropertyType.TEXTURE],
    keepLeaves: true,
    keepAttributes: true,
  }),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 90 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
for (const channel of keep) {
  if (channel.isDisposed()) throw new Error('A light-up channel was removed during optimisation');
}
document.createExtension(EXTMeshoptCompression).setRequired(true);

await io.write(OUTPUT, document);
console.log(`${source} → ${OUTPUT}`);
