import * as THREE from 'three';

export interface ViewCurve {
  log2Min: number;
  log2Max: number;
  values: number[];
}

const curveUniform: THREE.IUniform<THREE.DataTexture | null> = { value: null };
let installed = false;

/** Swaps three's CustomToneMapping for Blender's view transform + look, sampled per channel. */
export function installViewCurve(curve: ViewCurve) {
  const n = curve.values.length;
  const data = new Uint16Array(n * 4);
  curve.values.forEach((v, i) => {
    data.fill(THREE.DataUtils.toHalfFloat(v), i * 4, i * 4 + 4);
  });
  const texture = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  curveUniform.value = texture;
  if (installed) return;

  const lo = curve.log2Min.toFixed(4);
  const range = (curve.log2Max - curve.log2Min).toFixed(4);
  const toneMapping = `vec3 CustomToneMapping( vec3 color ) {
    vec3 p = ( clamp( log2( max( color * toneMappingExposure, vec3( 1e-7 ) ) ), ${lo}, ${lo} + ${range} ) - ${lo} ) / ${range};
    p = p * ${((n - 1) / n).toFixed(8)} + ${(0.5 / n).toFixed(8)};
    return vec3( texture2D( viewCurve, vec2( p.r, 0.5 ) ).r, texture2D( viewCurve, vec2( p.g, 0.5 ) ).r, texture2D( viewCurve, vec2( p.b, 0.5 ) ).r );
  }`;
  const original = THREE.ShaderChunk.tonemapping_pars_fragment;
  const patched = original.replace(/vec3 CustomToneMapping\(\s*vec3 color\s*\)\s*\{[^}]*\}/, toneMapping);
  if (patched === original) throw new Error('three.js tone-mapping chunk changed; recheck the view curve hook');
  THREE.ShaderChunk.tonemapping_pars_fragment = `uniform sampler2D viewCurve;\n${patched}`;
  installed = true;
}

/** Every material in the scene needs the curve bound before its first compile. */
export function bindViewCurve(
  material: THREE.Material,
  patch?: (shader: THREE.WebGLProgramParametersWithUniforms) => void,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.viewCurve = curveUniform;
    patch?.(shader);
  };
}

/** The scene-linear value the curve turns into `shown` (linear light): used to match a CSS colour exactly. */
export function sceneValueFor(curve: ViewCurve, shown: number) {
  const { values, log2Min, log2Max } = curve;
  const step = (log2Max - log2Min) / (values.length - 1);
  for (let i = 1; i < values.length; i++) {
    if (values[i] >= shown) {
      const t = (shown - values[i - 1]) / Math.max(values[i] - values[i - 1], 1e-9);
      return 2 ** (log2Min + (i - 1 + t) * step);
    }
  }
  return 2 ** log2Max;
}
