import * as THREE from 'three';
import { CAMERA, FRAMING } from './config';

/** Screen px per scene unit at the origin for a canvas `width` px wide. */
export function pxPerUnit(width: number) {
  return FRAMING.pxPerUnit * Math.max(1, width / FRAMING.designWidth);
}

/** Vertical FOV that keeps that scale on a canvas `height` px tall: a taller screen sees more, nothing grows. */
export function fovFor(width: number, height: number) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(height / (2 * CAMERA.distance * pxPerUnit(width))));
}
