import * as THREE from 'three';
import { LOGO } from './config';
import type { createGlass } from './glass';

type Glass = ReturnType<typeof createGlass>;

export function createLogo(model: THREE.Group, glass: Glass) {
  const mesh = model.getObjectByProperty('isMesh', true) as THREE.Mesh;
  mesh.material = glass.material;

  const logo = new THREE.Group();
  logo.position.x = LOGO.offsetX;
  logo.scale.setScalar(LOGO.size);
  const turn = new THREE.Group();
  turn.add(model);
  logo.add(turn);

  return {
    logo,
    turn,
    mesh,
    model,
    /** 0 = flat and clear, 1 = the full glass logo; it grows in depth and opacity together. */
    setForm(glassAmount: number, tilt: number) {
      model.scale.z = Math.max(glassAmount, 1e-3);
      glass.setOpacity(glassAmount);
      logo.rotation.x = LOGO.tilt * tilt;
    },
  };
}
