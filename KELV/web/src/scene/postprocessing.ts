import * as THREE from 'three';
import type { Look } from './config';

export type Grade = Pick<Look, 'bloom' | 'grade'>;

export interface Compositor {
  curve: number[];
  linearToAP1: number[];
  ap1ToLinear: number[];
}

const vertexShader = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const extractShader = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D inputImage;
  uniform float threshold;
  void main() {
    vec4 c = texture2D(inputImage, vUv);
    float peak = max(c.r, max(c.g, c.b));
    float factor = max(0.0, peak - threshold) / max(peak, 0.0001);
    gl_FragColor = vec4(c.rgb * factor, 1.0);
  }`;

const blurShader = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D inputImage;
  uniform vec2 direction;
  void main() {
    vec3 c = texture2D(inputImage, vUv).rgb * 0.227027;
    c += (texture2D(inputImage, vUv + direction * 1.384615).rgb + texture2D(inputImage, vUv - direction * 1.384615).rgb) * 0.316216;
    c += (texture2D(inputImage, vUv + direction * 3.230769).rgb + texture2D(inputImage, vUv - direction * 3.230769).rgb) * 0.070270;
    gl_FragColor = vec4(c, 1.0);
  }`;

/** Blender's ACEScct grade, sampled Look curve, vignette and grain, then the Filmic LUT. */
const finalShader = (curveSize: number) => /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D inputImage, bloomImage, lookCurve;
  uniform mat3 linearToAP1, ap1ToLinear;
  uniform float contrast, saturation, lookMix, vignette, grain, bloom, bloomOutside;

  float cct(float x) { return x <= 0.0078125 ? 10.5402377416545 * x + 0.0729055341958355 : (log2(x) + 9.72) / 17.52; }
  float uncct(float x) { return x <= 0.155251141552511 ? (x - 0.0729055341958355) / 10.5402377416545 : exp2(x * 17.52 - 9.72); }
  float curveValue(float x) {
    float p = (clamp(log2(max(x, 0.0000001)), -16.0, 8.0) + 16.0) / 24.0;
    return texture2D(lookCurve, vec2(p * ${((curveSize - 1) / curveSize).toFixed(10)} + ${(0.5 / curveSize).toFixed(10)}, 0.5)).r;
  }

  void main() {
    vec4 base = texture2D(inputImage, vUv);
    // The glow can be kept on the products (Figma: no halo over the background).
    vec3 halo = texture2D(bloomImage, vUv).rgb * bloom * mix(base.a, 1.0, bloomOutside);
    float haloAlpha = 1.0 - exp(-max(halo.r, max(halo.g, halo.b)));
    float alpha = base.a + haloAlpha * (1.0 - base.a);
    vec3 color = (base.rgb + halo) / max(alpha, 0.00001);

    vec3 ap1 = linearToAP1 * color;
    vec3 logColor = vec3(cct(ap1.r), cct(ap1.g), cct(ap1.b));
    float pivot = (log2(0.18) + 9.72) / 17.52;
    logColor = (logColor - pivot) * contrast + pivot;
    float luma = dot(logColor, vec3(0.2722287, 0.6740818, 0.0536895));
    logColor = mix(vec3(luma), logColor, saturation);
    color = max(vec3(0.0), ap1ToLinear * vec3(uncct(logColor.r), uncct(logColor.g), uncct(logColor.b)));
    color = mix(color, vec3(curveValue(color.r), curveValue(color.g), curveValue(color.b)), lookMix);

    color *= 1.0 - vignette * smoothstep(0.24, 0.70, length(vUv - 0.5));
    float noise = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    color *= exp2(noise * grain * 0.6);

    gl_FragColor = vec4(max(color, 0.0), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }`;

/** HDR render + bloom, composited with alpha so the page shows through. */
export function createPostprocessing(renderer: THREE.WebGLRenderer, lut: THREE.Data3DTexture, compositor: Compositor) {
  const target = (samples = 0) =>
    new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: samples > 0,
      samples,
    });
  const hdr = target(4);
  const bright = target();
  const blurX = target();
  const blurY = target();

  const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, toneMapped = false) =>
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      toneMapped,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });

  const extract = pass(extractShader, { inputImage: { value: hdr.texture }, threshold: { value: 1 } });
  const blur = pass(blurShader, { inputImage: { value: bright.texture }, direction: { value: new THREE.Vector2() } });

  const curveData = new Uint16Array(compositor.curve.map(THREE.DataUtils.toHalfFloat));
  const curve = new THREE.DataTexture(curveData, curveData.length, 1, THREE.RedFormat, THREE.HalfFloatType);
  curve.minFilter = curve.magFilter = THREE.LinearFilter;
  curve.needsUpdate = true;

  const uniforms = {
    inputImage: { value: hdr.texture },
    bloomImage: { value: blurY.texture },
    heroLUT: { value: lut },
    lookCurve: { value: curve },
    linearToAP1: { value: new THREE.Matrix3().fromArray(compositor.linearToAP1).transpose() },
    ap1ToLinear: { value: new THREE.Matrix3().fromArray(compositor.ap1ToLinear).transpose() },
    contrast: { value: 1 },
    saturation: { value: 1 },
    lookMix: { value: 1 },
    vignette: { value: 0 },
    grain: { value: 0 },
    bloom: { value: 0 },
    bloomOutside: { value: 1 },
  };
  const composite = pass(finalShader(curveData.length), uniforms, true);

  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, composite);
  quad.frustumCulled = false;
  const screen = new THREE.Scene().add(quad);
  const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function draw(material: THREE.ShaderMaterial, output: THREE.WebGLRenderTarget | null) {
    quad.material = material;
    renderer.setRenderTarget(output);
    renderer.render(screen, screenCamera);
  }

  return {
    /** Compiles the programs exactly as they will be drawn: the scene into the HDR target, then the passes. */
    async compile(scene: THREE.Scene, camera: THREE.Camera) {
      renderer.setRenderTarget(hdr);
      await renderer.compileAsync(scene, camera);
      for (const material of [extract, blur, composite]) {
        quad.material = material;
        renderer.setRenderTarget(material === composite ? null : bright);
        await renderer.compileAsync(screen, screenCamera);
      }
      renderer.setRenderTarget(null);
    },

    setSize(width: number, height: number) {
      hdr.setSize(width, height);
      const quarter = [Math.max(1, Math.round(width / 4)), Math.max(1, Math.round(height / 4))] as const;
      for (const t of [bright, blurX, blurY]) t.setSize(...quarter);
    },

    render(scene: THREE.Scene, camera: THREE.Camera, look: Grade) {
      renderer.setRenderTarget(hdr);
      renderer.render(scene, camera);

      if (look.bloom.strength > 0) {
        extract.uniforms.threshold.value = look.bloom.threshold;
        draw(extract, bright);
        blur.uniforms.inputImage.value = bright.texture;
        blur.uniforms.direction.value.set(look.bloom.radius / bright.width, 0);
        draw(blur, blurX);
        blur.uniforms.inputImage.value = blurX.texture;
        blur.uniforms.direction.value.set(0, look.bloom.radius / bright.height);
        draw(blur, blurY);
      }

      uniforms.contrast.value = look.grade.contrast;
      uniforms.saturation.value = look.grade.saturation;
      uniforms.lookMix.value = look.grade.lookMix;
      uniforms.vignette.value = look.grade.vignette;
      uniforms.grain.value = look.grade.grain;
      uniforms.bloom.value = look.bloom.strength;
      uniforms.bloomOutside.value = look.bloom.outside;
      draw(composite, null);
    },

    dispose() {
      for (const t of [hdr, bright, blurX, blurY]) t.dispose();
      for (const m of [extract, blur, composite]) m.dispose();
      geometry.dispose();
      curve.dispose();
    },
  };
}
