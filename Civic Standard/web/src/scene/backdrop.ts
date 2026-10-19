import * as THREE from 'three';
import { BACKDROP, CAMERA } from './config';
import { bindViewCurve, sceneValueFor, type ViewCurve } from './view-curve';

/** The rendered wall's size in scene units, at its distance from the camera. */
export const WALL_HEIGHT =
  2 * BACKDROP.cover * (CAMERA.distance + BACKDROP.distance) * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
export const WALL_WIDTH = WALL_HEIGHT * BACKDROP.aspect;

/** GLSL: the leaves' shadow (leavesMin…1) at a wall uv. */
export const leavesShadow = (sampler: string, uv: string) =>
  `mix( ${BACKDROP.leavesMin.toFixed(3)}, 1.0, texture2D( ${sampler}, ${uv} ).r )`;

/**
 * The leaf-lit wall behind the tube: Blender's light times the leaves' shadow, which sways in a slow wind.
 * Until the handover it shows the preloader's flat paper colour exactly; `reveal` (0…1) then lets the light in
 * from the bright spot outwards.
 */
export function createBackdrop(map: THREE.Texture, leaves: THREE.Texture, curve: ViewCurve, paperCss: string) {
  const paper = new THREE.Color(paperCss);
  const uniforms = {
    backdropPaper: {
      value: new THREE.Vector3(
        ...[paper.r, paper.g, paper.b].map((channel) => sceneValueFor(curve, channel) / BACKDROP.gain),
      ),
    },
    backdropReveal: { value: 0 },
    backdropTime: { value: 0 },
    leavesMap: { value: leaves },
  };

  const material = new THREE.MeshBasicMaterial({ map, color: new THREE.Color().setScalar(BACKDROP.gain) });
  bindViewCurve(material, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 backdropPaper;
        uniform float backdropReveal;
        uniform float backdropTime;
        uniform sampler2D leavesMap;

        vec2 swayed( vec2 uv, float t ) {
          float angle = ${BACKDROP.swayAngle.toFixed(4)} * ( sin( t ) + 0.4 * sin( t * 2.3 + 1.3 ) );
          vec2 pivot = vec2( ${BACKDROP.swayPivot.map((v) => v.toFixed(3)).join(', ')} );
          vec2 p = ( uv - pivot ) * vec2( ${BACKDROP.aspect.toFixed(4)}, 1.0 );
          p = mat2( cos( angle ), sin( angle ), -sin( angle ), cos( angle ) ) * p;
          uv = p / vec2( ${BACKDROP.aspect.toFixed(4)}, 1.0 ) + pivot;
          return uv + ${BACKDROP.flutter.toFixed(5)} * vec2( sin( uv.y * 23.0 + t * 2.1 ), cos( uv.x * 19.0 - t * 1.7 ) );
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 leavesUv = swayed( vMapUv, backdropTime * ${BACKDROP.swaySpeed.toFixed(3)} );
        vec3 lit = texture2D( map, vMapUv ).rgb * ${leavesShadow('leavesMap', 'leavesUv')};
        vec2 fromLight = ( vMapUv - vec2( ${BACKDROP.lightOrigin.map((v) => v.toFixed(3)).join(', ')} ) ) * vec2( ${BACKDROP.aspect.toFixed(4)}, 1.0 ) * ${BACKDROP.cover.toFixed(3)};
        float edge = backdropReveal * ${BACKDROP.revealReach.toFixed(2)};
        float light = 1.0 - smoothstep( edge - 0.45, edge, length( fromLight ) );
        diffuseColor.rgb *= mix( backdropPaper, lit, light );`,
      );
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT), material);
  mesh.position.z = -BACKDROP.distance;
  return {
    backdrop: mesh,
    backdropUniforms: uniforms,
    /** Never smaller than in the .blend, and grown to cover wider or taller views, like CSS `cover`. */
    fitBackdrop(camera: THREE.PerspectiveCamera) {
      const visibleHeight =
        2 * (CAMERA.distance + BACKDROP.distance) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const scale = Math.max(1, visibleHeight / WALL_HEIGHT, (visibleHeight * camera.aspect) / WALL_WIDTH);
      mesh.scale.setScalar(scale);
      return scale;
    },
  };
}
