import * as THREE from 'three';

// The leaves' shadow, drawn live: a canopy off the frame (front left), its branches and leaves as flat shapes seen
// from the sun, swaying in the wind. Each frame they darken a white target (what reaches the ground through them),
// which a blur softens as the sun's disc and the leaves' height do; scene materials read it as the sun's cookie.
// Sizes in metres across the sun's view.
const LEAF = { length: [0.08, 0.15], width: [0.04, 0.07], opacity: 0.94 };
const BLUR_M = 0.022;
const RESOLUTION = 1024;

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Shape {
  centre: THREE.Vector2;
  size: THREE.Vector2;
  angle: number;
  leaf: boolean;
  branch: THREE.Vector2; // where its branch starts: the whole branch turns about it
  twig: THREE.Vector2; // where its twig starts: the twig turns about it too
  phase: THREE.Vector3; // branch, twig, leaf
}

/** Branches reaching in towards `reach` (points across the sun's view the shade should cover). */
function grow(reach: THREE.Vector2[], from: THREE.Vector2[], rand: () => number) {
  const shapes: Shape[] = [];
  const v = (x = 0, y = 0) => new THREE.Vector2(x, y);
  reach.forEach((end, b) => {
    const start = from[b % from.length];
    const branchPhase = rand() * Math.PI * 2;
    const steps = 14;
    const bend = (rand() - 0.5) * 0.7;
    const direction = end.clone().sub(start);
    const length = direction.length();
    const normal = v(-direction.y, direction.x).normalize();
    let previous = start.clone();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const point = start
        .clone()
        .addScaledVector(direction, t)
        .addScaledVector(normal, Math.sin(t * Math.PI) * bend * length * 0.3);
      const segment = point.clone().sub(previous);
      shapes.push({
        centre: previous.clone().add(point).multiplyScalar(0.5),
        size: v(segment.length() * 1.08, THREE.MathUtils.lerp(0.07, 0.018, t)),
        angle: Math.atan2(segment.y, segment.x),
        leaf: false,
        branch: start,
        twig: start,
        phase: new THREE.Vector3(branchPhase, branchPhase, 0),
      });
      // twigs along the outer two thirds, each with its cluster of leaves
      if (t > 0.3) {
        const twigs = 2 + Math.floor(rand() * 2);
        for (let k = 0; k < twigs; k++) {
          const side = rand() < 0.5 ? -1 : 1;
          const heading = Math.atan2(segment.y, segment.x) + side * (0.5 + rand() * 0.7);
          const twigLength = 0.25 + rand() * 0.55;
          const base = previous.clone().lerp(point, rand());
          const tip = base.clone().add(v(Math.cos(heading), Math.sin(heading)).multiplyScalar(twigLength));
          const twigPhase = rand() * Math.PI * 2;
          shapes.push({
            centre: base.clone().add(tip).multiplyScalar(0.5),
            size: v(twigLength, 0.012),
            angle: heading,
            leaf: false,
            branch: start,
            twig: base,
            phase: new THREE.Vector3(branchPhase, twigPhase, 0),
          });
          const leaves = 22 + Math.floor(rand() * 20);
          for (let l = 0; l < leaves; l++) {
            const along = base.clone().lerp(tip, 0.15 + rand() * 0.95);
            const spread = 0.16 * (0.4 + rand());
            const a = rand() * Math.PI * 2;
            shapes.push({
              centre: along.add(v(Math.cos(a), Math.sin(a)).multiplyScalar(spread * rand())),
              size: v(
                THREE.MathUtils.lerp(LEAF.length[0], LEAF.length[1], rand()),
                THREE.MathUtils.lerp(LEAF.width[0], LEAF.width[1], rand()),
              ),
              angle: heading + (rand() - 0.5) * 2.4,
              leaf: true,
              branch: start,
              twig: base,
              phase: new THREE.Vector3(branchPhase, twigPhase, rand() * Math.PI * 2),
            });
          }
        }
      }
      previous = point;
    }
  });
  return shapes;
}

const VERTEX = /* glsl */ `
attribute vec4 centreSize;
attribute vec2 angleLeaf;
attribute vec4 bases;
attribute vec3 phases;
uniform float time;
uniform vec4 view; // the target's area across the sun's view: x, y of its corner, width, height
varying vec2 vUv;
varying float vLeaf;

vec2 turn( vec2 p, vec2 about, float angle ) {
  vec2 d = p - about;
  float c = cos( angle ), s = sin( angle );
  return about + vec2( c * d.x - s * d.y, s * d.x + c * d.y );
}

void main() {
  vUv = position.xy;
  vLeaf = angleLeaf.y;
  // wind: slow gusts turn whole branches, twigs answer quicker, leaves flutter (turning, they show less of themselves)
  float gust = 0.6 + 0.4 * sin( time * 0.21 ) * sin( time * 0.13 + 1.3 );
  float branchTurn = gust * ( 0.022 * sin( time * 0.9 + phases.x ) + 0.012 * sin( time * 1.7 + phases.x * 1.3 ) );
  float twigTurn = gust * 0.06 * sin( time * 2.3 + phases.y );
  float flutter = angleLeaf.y * gust * 0.35 * sin( time * 6.0 + phases.z );
  float tilt = 1.0 - angleLeaf.y * 0.35 * ( 0.5 + 0.5 * sin( time * 4.1 + phases.z * 1.7 ) ) * gust;
  float angle = angleLeaf.x + branchTurn + twigTurn + flutter;
  vec2 local = position.xy * centreSize.zw * 0.5 * vec2( 1.0, tilt );
  vec2 p = centreSize.xy + vec2( cos( angle ) * local.x - sin( angle ) * local.y, sin( angle ) * local.x + cos( angle ) * local.y );
  p = turn( p, bases.zw, twigTurn );
  p = turn( p, bases.xy, branchTurn );
  gl_Position = vec4( ( p - view.xy ) / view.zw * 2.0 - 1.0, 0.0, 1.0 );
}
`;

const FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying float vLeaf;
void main() {
  // a leaf: pointed at both ends; a branch: a plain bar
  float edge = vLeaf > 0.5 ? abs( vUv.y ) - ( 1.0 - vUv.x * vUv.x ) * ( 1.0 - 0.25 * vUv.x ) : abs( vUv.y ) - 1.0;
  float inside = 1.0 - smoothstep( -fwidth( edge ), fwidth( edge ), edge );
  gl_FragColor = vec4( 0.0, 0.0, 0.0, inside * ( vLeaf > 0.5 ? ${LEAF.opacity.toFixed(2)} : 1.0 ) );
}
`;

const BLUR = /* glsl */ `
uniform sampler2D source;
uniform vec2 step;
varying vec2 vUv;
void main() {
  // a 13-tap gaussian along one axis
  vec4 sum = texture2D( source, vUv ) * 0.1964;
  float weights[ 6 ] = float[]( 0.1750, 0.1210, 0.0656, 0.0279, 0.0093, 0.0024 );
  for ( int i = 0; i < 6; i++ ) {
    vec2 offset = step * float( i + 1 );
    sum += ( texture2D( source, vUv + offset ) + texture2D( source, vUv - offset ) ) * weights[ i ];
  }
  gl_FragColor = sum;
}
`;

export interface Foliage {
  /** The cookie: 1 where the sun gets through. */
  texture: THREE.Texture;
  update(renderer: THREE.WebGLRenderer, time: number): void;
  dispose(): void;
}

/**
 * `area`: the cookie's area across the sun's view (min x, min y, width, height, in metres). `reach` and `from`: where
 * the branches come from and reach to, in the same coordinates.
 */
export function createFoliage(area: THREE.Vector4, from: THREE.Vector2[], reach: THREE.Vector2[]): Foliage {
  const shapes = grow(reach, from, random(11));
  const base = new THREE.PlaneGeometry(2, 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  const centreSize = new Float32Array(shapes.length * 4);
  const angleLeaf = new Float32Array(shapes.length * 2);
  const bases = new Float32Array(shapes.length * 4);
  const phases = new Float32Array(shapes.length * 3);
  shapes.forEach((s, i) => {
    centreSize.set([s.centre.x, s.centre.y, s.size.x, s.size.y], i * 4);
    angleLeaf.set([s.angle, s.leaf ? 1 : 0], i * 2);
    bases.set([s.branch.x, s.branch.y, s.twig.x, s.twig.y], i * 4);
    phases.set([s.phase.x, s.phase.y, s.phase.z], i * 3);
  });
  geometry.setAttribute('centreSize', new THREE.InstancedBufferAttribute(centreSize, 4));
  geometry.setAttribute('angleLeaf', new THREE.InstancedBufferAttribute(angleLeaf, 2));
  geometry.setAttribute('bases', new THREE.InstancedBufferAttribute(bases, 4));
  geometry.setAttribute('phases', new THREE.InstancedBufferAttribute(phases, 3));
  geometry.instanceCount = shapes.length;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { time: { value: 0 }, view: { value: area } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // each shape lets through (1 − its opacity) of what is left: overlapping leaves darken further
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const leaves = new THREE.Mesh(geometry, material);
  leaves.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(leaves);
  const camera = new THREE.Camera();

  const width = RESOLUTION;
  const height = Math.round((RESOLUTION * area.w) / area.z);
  const options = { type: THREE.HalfFloatType, depthBuffer: false } as const;
  const sharp = new THREE.WebGLRenderTarget(width, height, { ...options, samples: 4 });
  const across = new THREE.WebGLRenderTarget(width, height, options);
  const soft = new THREE.WebGLRenderTarget(width, height, options);

  // the blur: σ ≈ 2 taps; BLUR_M across the cookie in each pass's step
  const blurMaterial = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: BLUR,
    uniforms: { source: { value: null }, step: { value: new THREE.Vector2() } },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
  quad.frustumCulled = false;
  const blurScene = new THREE.Scene();
  blurScene.add(quad);
  const stepPx = (BLUR_M / area.z) * width * 0.5;
  const white = new THREE.Color(1, 1, 1);
  const clear = new THREE.Color();

  return {
    texture: soft.texture,
    update(renderer, time) {
      material.uniforms.time.value = time;
      renderer.getClearColor(clear);
      const alpha = renderer.getClearAlpha();
      renderer.setClearColor(white, 1);
      renderer.setRenderTarget(sharp);
      renderer.clear();
      renderer.render(scene, camera);
      blurMaterial.uniforms.source.value = sharp.texture;
      blurMaterial.uniforms.step.value.set(stepPx / width, 0);
      renderer.setRenderTarget(across);
      renderer.render(blurScene, camera);
      blurMaterial.uniforms.source.value = across.texture;
      blurMaterial.uniforms.step.value.set(0, stepPx / height);
      renderer.setRenderTarget(soft);
      renderer.render(blurScene, camera);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clear, alpha);
    },
    dispose() {
      geometry.dispose();
      base.dispose();
      material.dispose();
      blurMaterial.dispose();
      quad.geometry.dispose();
      sharp.dispose();
      across.dispose();
      soft.dispose();
    },
  };
}
