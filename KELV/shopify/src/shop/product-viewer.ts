import { ProductCanvas } from '@/home/product-canvas';
import { KelvElement } from '@/lib/element';
import { PRODUCTS, type ProductName } from '@/scene/product-config';

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
export class ProductViewer extends KelvElement {
  private orientation: Quaternion = [0, 0, 0, 1];
  private velocity = { x: 0, y: 0 };
  private zoom = 1;
  private targetZoom = 1;
  private drag: { id: number; x: number; y: number; time: number } | null = null;

  protected mount() {
    const model = this.dataset.model as ProductName;
    const canvas = this.ref<HTMLCanvasElement>('canvas');
    const stage = this.ref('stage');
    if (!(model in PRODUCTS) || !canvas || !stage) return;

    const product = new ProductCanvas(canvas, [model], null, () => this.classList.add('is-3d'));
    this.cleanup(() => product.dispose());
    this.frame(() => {
      if (!product.ready) return;
      this.step();
      product.draw(model, { spin: 0, tiltX: 0, tiltY: 0, zoom: this.zoom, orientation: this.orientation });
    });

    this.listen(stage, 'pointerdown', (event) => this.onPointerDown(event as PointerEvent, stage));
    this.listen(stage, 'pointermove', (event) => this.onPointerMove(event as PointerEvent));
    for (const type of ['pointerup', 'pointercancel']) {
      this.listen(stage, type, (event) => {
        if (this.drag?.id === (event as PointerEvent).pointerId) this.drag = null;
      });
    }
    for (const button of this.querySelectorAll<HTMLButtonElement>('[data-zoom]')) {
      const factor = button.dataset.zoom === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP;
      this.listen(button, 'click', () => {
        this.targetZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.targetZoom * factor));
      });
    }
  }

  /** Inertia after a release, and the zoom easing towards its target. */
  private step() {
    const v = this.velocity;
    if (!this.drag && (v.x || v.y)) {
      v.x *= INERTIA;
      v.y *= INERTIA;
      if (Math.hypot(v.x, v.y) < IDLE_SPEED) v.x = v.y = 0;
      this.orientation = turn(turn(this.orientation, 'y', v.x), 'x', v.y);
    }
    const gap = this.targetZoom - this.zoom;
    this.zoom = Math.abs(gap) < 1e-3 ? this.targetZoom : this.zoom + gap * ZOOM_EASE;
  }

  private onPointerDown(event: PointerEvent, stage: HTMLElement) {
    stage.setPointerCapture(event.pointerId);
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
    this.velocity = { x: 0, y: 0 };
  }

  private onPointerMove(event: PointerEvent) {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const frames = Math.max(1, (event.timeStamp - drag.time) / 16.7);
    this.orientation = turn(turn(this.orientation, 'y', dx * DRAG_TURN), 'x', dy * DRAG_TURN);
    this.velocity = { x: (dx * DRAG_TURN) / frames, y: (dy * DRAG_TURN) / frames };
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
  }
}
