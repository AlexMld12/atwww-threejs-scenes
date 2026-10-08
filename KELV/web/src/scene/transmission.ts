import * as THREE from 'three';

// Removes r186's white transmission matte, so the hollow cap shows the page instead of a grey box.
export const clearCapTransmission = THREE.ShaderChunk.transmission_pars_fragment
  .replace(
    'vec3 attenuatedColor = transmittance * transmittedLight.rgb;',
    `transmittedLight.rgb = max(vec3(0.0), transmittedLight.rgb - vec3(1.0 - transmittedLight.a));
    transmittedLight.a = clamp(2.0 * transmittedLight.a - 1.0, 0.0, 1.0);
    vec3 attenuatedColor = transmittance * transmittedLight.rgb;`,
  )
  .replace(
    '1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor',
    '1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor * (1.0 - max(F.r, max(F.g, F.b)))',
  );
