'use client';

import Image from 'next/image';
import { useMemo, useRef, type PointerEvent } from 'react';
import { useProductStage } from '@/components/home/use-product-stage';
import { cx } from '@/lib/css';
import { useFrame } from '@/lib/scroll';
import type { Product } from '@/shop/catalog';

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 2.4;
const ZOOM_STEP = 1.25;
const ZOOM_EASE = 0.14;
// Radians per dragged px, about the screen's axes (a trackball: free all round, never upside-down controls).
const DRAG_TURN = 0.01;
// Share of the turning speed kept per frame after release.
const INERTIA = 0.94;
const IDLE_SPEED = 0.0015;

type Quaternion = [number, number, number, number];

/** `q` turned by `angle` about a screen axis (x or y), applied in camera space. */
function turn(q: Quaternion, axis: 'x' | 'y', angle: number): Quaternion {
  const h = Math.sin(angle / 2);
  const [ax, ay, az, aw] = axis === 'x' ? [h, 0, 0, Math.cos(angle / 2)] : [0, h, 0, Math.cos(angle / 2)];
  const [bx, by, bz, bw] = q;
  const r: Quaternion = [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
  const n = Math.hypot(...r);
  return r.map((v) => v / n) as Quaternion;
}

/** The product's GLB on its page: dragged round in any direction, zoomed with + and −. The packshot image stands in until it loads. */
export function ProductViewer({ product }: { product: Product }) {
  const models = useMemo(() => [product.model], [product.model]);
  const { canvasRef, ready, draw } = useProductStage(models);
  const state = useRef({
    orientation: [0, 0, 0, 1] as Quaternion,
    velocity: { x: 0, y: 0 },
    zoom: 1,
    targetZoom: 1,
    drag: null as { id: number; x: number; y: number; time: number } | null,
  });

  useFrame(() => {
    if (!ready) return;
    const s = state.current;
    const v = s.velocity;
    if (!s.drag && (v.x || v.y)) {
      v.x *= INERTIA;
      v.y *= INERTIA;
      if (Math.hypot(v.x, v.y) < IDLE_SPEED) v.x = v.y = 0;
      s.orientation = turn(turn(s.orientation, 'y', v.x), 'x', v.y);
    }
    s.zoom = Math.abs(s.targetZoom - s.zoom) < 1e-3 ? s.targetZoom : s.zoom + (s.targetZoom - s.zoom) * ZOOM_EASE;
    draw(product.model, { spin: 0, tiltX: 0, tiltY: 0, zoom: s.zoom, orientation: s.orientation });
  });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    state.current.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
    state.current.velocity = { x: 0, y: 0 };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s.drag || s.drag.id !== event.pointerId) return;
    const dx = event.clientX - s.drag.x;
    const dy = event.clientY - s.drag.y;
    const frames = Math.max(1, (event.timeStamp - s.drag.time) / 16.7);
    s.orientation = turn(turn(s.orientation, 'y', dx * DRAG_TURN), 'x', dy * DRAG_TURN);
    s.velocity = { x: (dx * DRAG_TURN) / frames, y: (dy * DRAG_TURN) / frames };
    s.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (state.current.drag?.id === event.pointerId) state.current.drag = null;
  };

  const zoomBy = (factor: number) => {
    const s = state.current;
    s.targetZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s.targetZoom * factor));
  };

  return (
    <div className={cx('viewer', ready && 'is-3d')}>
      <Image
        className="viewer__img"
        src={product.image}
        alt={product.name}
        width={1024}
        height={1024}
        unoptimized
        priority
      />
      <div
        className="viewer__stage"
        data-lenis-prevent=""
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="viewer__canvas" aria-hidden="true" />
      </div>
      <div className="viewer__zoom">
        <button type="button" className="viewer__btn mono" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
          +
        </button>
        <button type="button" className="viewer__btn mono" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
          −
        </button>
      </div>
    </div>
  );
}
