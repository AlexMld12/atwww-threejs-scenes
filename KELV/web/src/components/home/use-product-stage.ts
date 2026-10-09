'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { finishTask, type PreloadTask } from '@/lib/preload';
import { markRendered, onRenderScale, renderScale } from '@/lib/quality';
import { PRODUCTS, PRODUCT_LOOK, type ProductName } from '@/scene/product-config';
import type { ProductPose, ProductStage } from '@/scene/product-stage';

const MAX_PIXEL_RATIO = 2;

/** A 3D product canvas: `draw` keeps it on whole device pixels and renders only when something changed. */
export function useProductStage(names: ProductName[], compileTask?: PreloadTask) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stage = useRef<ProductStage | null>(null);
  const last = useRef({ product: '', pose: '', dirty: true });
  const box = useRef({ width: 0, height: 0, dpr: 1, x: Number.NaN, y: Number.NaN });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    let disposed = false;

    // The canvas gets whole device pixels; a fractional size or position would be resampled (blurred).
    const resize = () => {
      const current = stage.current;
      if (!current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const width = Math.round(host.clientWidth * dpr) / dpr;
      const height = Math.round(host.clientHeight * dpr) / dpr;
      if (!width || !height) return;
      Object.assign(box.current, { width, height, dpr, x: Number.NaN, y: Number.NaN });
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      current.setSize(width, height, dpr * renderScale());
      last.current.dirty = true;
    };
    const observer = new ResizeObserver(resize);
    const stopScale = onRenderScale(resize);

    import('@/scene/product-stage')
      .then(({ createProductStage }) => createProductStage(canvas, names, compileTask))
      .then((created) => {
        if (disposed) return created.dispose();
        stage.current = created;
        resize();
        observer.observe(host);
        setReady(true);
        if (process.env.NODE_ENV === 'development') {
          Object.assign(window, {
            [`__kelvProducts_${compileTask}`]: created,
            __PRODUCT_LOOK: PRODUCT_LOOK,
            __PRODUCTS: PRODUCTS,
          });
        }
      })
      .catch((error: unknown) => {
        for (const name of names) finishTask(PRODUCTS[name].task);
        if (compileTask) finishTask(compileTask);
        console.error('[product stage]', error);
      });

    return () => {
      disposed = true;
      observer.disconnect();
      stopScale();
      stage.current?.dispose();
      stage.current = null;
    };
  }, [names, compileTask]);

  const draw = useCallback((product: ProductName, pose: ProductPose) => {
    const current = stage.current;
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!current || !canvas || !host) return;

    // Centred on the host (its centre survives the host's own rotation), corner snapped to the pixel grid.
    const b = box.current;
    const rect = host.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const x = Math.round((cx - b.width / 2) * b.dpr) / b.dpr - cx;
    const y = Math.round((cy - b.height / 2) * b.dpr) / b.dpr - cy;
    if (x !== b.x || y !== b.y) {
      b.x = x;
      b.y = y;
      canvas.style.transform = `translate(${x}px, ${y}px)`;
    }

    const s = last.current;
    const key = `${pose.spin} ${pose.tiltX} ${pose.tiltY} ${pose.roll ?? 0} ${pose.zoom ?? 1} ${pose.orientation ?? ''}`;
    if (!s.dirty && s.product === product && s.pose === key) return;
    if (s.product !== product) current.setProduct(product);
    current.setPose(pose);
    current.render();
    markRendered();
    Object.assign(s, { product, pose: key, dirty: false });
  }, []);

  return { canvasRef, ready, draw };
}
