import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LOGO_VIEWBOX, logoPolygons } from '@/lib/logo-outline';
import { INTRO, LOGO } from './config';
import { pxPerUnit } from './framing';
import type { createGlass } from './glass';

type Glass = ReturnType<typeof createGlass>;

/** The preloader's outline, drawn on the logo's front face so it turns with the glass. */
function createOutline() {
  const positions: number[] = [];
  const cx = LOGO_VIEWBOX.width / 2;
  const cy = LOGO_VIEWBOX.height / 2;
  for (const points of logoPolygons()) {
    points.forEach(([x, y], i) => {
      const [nx, ny] = points[(i + 1) % points.length];
      positions.push(
        (x - cx) * LOGO.outlineScale,
        (cy - y) * LOGO.outlineScale,
        0,
        (nx - cx) * LOGO.outlineScale,
        (cy - ny) * LOGO.outlineScale,
        0,
      );
    });
  }
  const geometry = new LineSegmentsGeometry().setPositions(positions);
  const material = new LineMaterial({ color: 0x000000, transparent: true, toneMapped: false });
  return new LineSegments2(geometry, material);
}

export function createLogo(model: THREE.Group, glass: Glass) {
  const mesh = model.getObjectByProperty('isMesh', true) as THREE.Mesh;
  mesh.material = glass.material;

  const outline = createOutline();
  outline.visible = false;

  const logo = new THREE.Group();
  logo.position.x = LOGO.offsetX;
  logo.scale.setScalar(LOGO.size);
  const turn = new THREE.Group();
  turn.add(model, outline);
  logo.add(turn);

  const lineMaterial = outline.material;
  return {
    logo,
    turn,
    mesh,
    model,
    outline,
    /** Same stroke as the preloader's: viewBox units at the scene's px per unit. */
    resize(width: number, height: number) {
      lineMaterial.resolution.set(width, height);
      lineMaterial.linewidth = INTRO.lineWidth * LOGO.outlineScale * LOGO.size * pxPerUnit(width);
    },
    /** 0 = flat outline only, 1 = the full glass logo; `lines` is the outline's opacity. */
    setForm(glassAmount: number, lines: number, tilt: number) {
      model.scale.z = Math.max(glassAmount, 1e-3);
      outline.position.z = (LOGO.depth / 2) * model.scale.z + 1e-3;
      glass.setOpacity(glassAmount);
      lineMaterial.opacity = lines;
      outline.visible = lines > 0;
      logo.rotation.x = LOGO.tilt * tilt;
    },
  };
}
