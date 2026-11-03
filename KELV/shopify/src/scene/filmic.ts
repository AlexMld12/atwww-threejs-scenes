import * as THREE from 'three';

export interface LutInfo {
  file: string;
  size: number;
  log2min: number;
  log2max: number;
}

let installed = false;

/** Replaces three's CustomToneMapping with the LUT; materials bind it as the `heroLUT` uniform. */
export function installFilmic(info: LutInfo) {
  if (installed) return;
  const n = info.size;
  const range = info.log2max - info.log2min;
  const filmic = `vec3 CustomToneMapping( vec3 color ) {
    vec3 p = (clamp(log2(max(color * toneMappingExposure, vec3(0.0000001))), ${info.log2min.toFixed(1)}, ${info.log2max.toFixed(1)}) - (${info.log2min.toFixed(1)})) / ${range.toFixed(1)};
    return texture(heroLUT, p * ${((n - 1) / n).toFixed(10)} + ${(0.5 / n).toFixed(10)}).rgb;
  }`;
  const original = THREE.ShaderChunk.tonemapping_pars_fragment;
  const patched = original.replace(/vec3 CustomToneMapping\(\s*vec3 color\s*\)\s*\{[^}]*\}/, filmic);
  if (patched === original) throw new Error('three.js tone-mapping chunk changed; recheck the Filmic hook');
  THREE.ShaderChunk.tonemapping_pars_fragment = `uniform highp sampler3D heroLUT;\n${patched}`;
  installed = true;
}

export function createLut(buffer: ArrayBuffer, info: LutInfo) {
  const lut = new THREE.Data3DTexture(new Uint16Array(buffer), info.size, info.size, info.size);
  lut.format = THREE.RGBAFormat;
  lut.type = THREE.HalfFloatType;
  lut.minFilter = lut.magFilter = THREE.LinearFilter;
  lut.unpackAlignment = 1;
  lut.needsUpdate = true;
  return lut;
}
