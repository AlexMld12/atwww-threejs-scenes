import { addTasks, finishTask, type PreloadTask } from '@/lib/preload';
import { markRendered, onRenderScale, pixelRatio, renderScale } from '@/lib/quality';
import { PRODUCT_LOOK, PRODUCTS, type ProductName } from '@/scene/product-config';
import type { ProductPose, ProductStage } from '@/scene/product-stage';

/**
 * A 3D product canvas (Pillars, the travelling product, the product page): `draw` keeps it on whole device pixels
 * and renders only when something changed. `compile` is the preloader task of its shader compilation, weighted in MB.
 */
export class ProductCanvas {
  ready = false;
  private stage: ProductStage | null = null;
  private disposed = false;
  private last = { product: '', pose: '', dirty: true };
  private box = { width: 0, height: 0, dpr: 1, x: Number.NaN, y: Number.NaN };
  private readonly host: HTMLElement;
  private readonly observer = new ResizeObserver(() => this.resize());
  private readonly stopScale = onRenderScale(() => this.resize());

  constructor(
    private readonly canvas: HTMLCanvasElement,
    names: ProductName[],
    compile: { task: PreloadTask; weight: number } | null,
    onReady: () => void,
  ) {
    this.host = canvas.parentElement!;
    addTasks(Object.fromEntries(names.map((name) => [PRODUCTS[name].task, PRODUCTS[name].weight])));
    if (compile) addTasks({ [compile.task]: compile.weight });

    import('@/scene/product-stage')
      .then(({ createProductStage }) => createProductStage(canvas, names, compile?.task))
      .then((created) => {
        if (this.disposed) return created.dispose();
        this.stage = created;
        this.resize();
        this.observer.observe(this.host);
        this.ready = true;
        onReady();
        if (import.meta.env.DEV) {
          Object.assign(window, {
            [`__kelvProducts_${compile?.task ?? 'viewer'}`]: created,
            __PRODUCT_LOOK: PRODUCT_LOOK,
            __PRODUCTS: PRODUCTS,
          });
        }
      })
      .catch((error: unknown) => {
        for (const name of names) finishTask(PRODUCTS[name].task);
        if (compile) finishTask(compile.task);
        console.error('[product stage]', error);
      });
  }

  // The canvas gets whole device pixels; a fractional size or position would be resampled (blurred).
  private resize() {
    const stage = this.stage;
    if (!stage) return;
    const dpr = pixelRatio();
    const width = Math.round(this.host.clientWidth * dpr) / dpr;
    const height = Math.round(this.host.clientHeight * dpr) / dpr;
    if (!width || !height) return;
    Object.assign(this.box, { width, height, dpr, x: Number.NaN, y: Number.NaN });
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    stage.setSize(width, height, dpr * renderScale());
    this.last.dirty = true;
  }

  draw(product: ProductName, pose: ProductPose) {
    const stage = this.stage;
    if (!stage) return;

    // Centred on the host (its centre survives the host's own rotation), corner snapped to the pixel grid.
    const b = this.box;
    const rect = this.host.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const x = Math.round((cx - b.width / 2) * b.dpr) / b.dpr - cx;
    const y = Math.round((cy - b.height / 2) * b.dpr) / b.dpr - cy;
    if (x !== b.x || y !== b.y) {
      b.x = x;
      b.y = y;
      this.canvas.style.transform = `translate(${x}px, ${y}px)`;
    }

    const s = this.last;
    const key = `${pose.spin} ${pose.tiltX} ${pose.tiltY} ${pose.roll ?? 0} ${pose.zoom ?? 1} ${pose.orientation ?? ''}`;
    if (!s.dirty && s.product === product && s.pose === key) return;
    if (s.product !== product) stage.setProduct(product);
    stage.setPose(pose);
    stage.render();
    markRendered();
    Object.assign(s, { product, pose: key, dirty: false });
  }

  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.stopScale();
    this.stage?.dispose();
    this.stage = null;
  }
}
