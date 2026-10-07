import { InterpolateDiscrete, InterpolateLinear, NumberKeyframeTrack, type Mesh } from 'three';
import type { GLTF, GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';

const EMISSIVE_STRENGTH = /^\/materials\/(\d+)\/extensions\/KHR_materials_emissive_strength\/emissiveStrength$/;

interface ChannelDef {
  sampler: number;
  target: { extensions?: { KHR_animation_pointer?: { pointer: string } } };
}
interface SamplerDef {
  input: number;
  output: number;
  interpolation?: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
}

/**
 * KHR_animation_pointer support for the emissive-strength channels (the K1 light-up), which
 * GLTFLoader in three r186 does not read.
 */
export class AnimationPointerPlugin implements GLTFLoaderPlugin {
  readonly name = 'KHR_animation_pointer';

  constructor(private readonly parser: GLTFParser) {}

  async afterRoot(result: GLTF) {
    const { json } = this.parser;
    const animations: { channels: ChannelDef[]; samplers: SamplerDef[] }[] = json.animations ?? [];

    for (const [index, definition] of animations.entries()) {
      const clip = result.animations[index];
      for (const channel of definition.channels) {
        const pointer = channel.target.extensions?.KHR_animation_pointer?.pointer;
        if (!pointer) continue;

        const match = pointer.match(EMISSIVE_STRENGTH);
        if (!match) throw new Error(`Unsupported animation pointer: ${pointer}`);
        const materialName: string = json.materials[Number(match[1])].name;
        const sampler = definition.samplers[channel.sampler];
        if (sampler.interpolation === 'CUBICSPLINE') throw new Error('Unsupported pointer interpolation');

        const [times, values] = await Promise.all([
          this.parser.getDependency('accessor', sampler.input),
          this.parser.getDependency('accessor', sampler.output),
        ]);
        const interpolation = sampler.interpolation === 'STEP' ? InterpolateDiscrete : InterpolateLinear;

        const targeted = new Set<unknown>();
        result.scene.traverse((object) => {
          const mesh = object as Mesh;
          if (!mesh.isMesh || Array.isArray(mesh.material)) return;
          if (mesh.material.name !== materialName || targeted.has(mesh.material)) return;
          targeted.add(mesh.material);
          clip.tracks.push(
            new NumberKeyframeTrack(`${mesh.uuid}.material.emissiveIntensity`, times.array, values.array, interpolation),
          );
        });
        if (!targeted.size) throw new Error(`Missing animated material: ${materialName}`);
      }
      clip.resetDuration();
    }
  }
}
