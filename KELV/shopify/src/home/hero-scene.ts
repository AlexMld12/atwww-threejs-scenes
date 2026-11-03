import { KelvElement } from '@/lib/element';
import { frameScroll, layoutVersion, viewRect, viewportSize } from '@/lib/layout';
import { clamp01, prefersReducedMotion } from '@/lib/math';
import { isLayerPage } from '@/lib/page-layers';
import { addTasks, finishTask } from '@/lib/preload';
import { markRendered, pixelRatio, renderScale, sceneFrameMs } from '@/lib/quality';
import { isReady } from '@/lib/scroll';
import { INTRO_DURATION, LOOK, REST_TIME } from '@/scene/config';
import type { HeroScene as Scene } from '@/scene/hero-scene';

const TASKS = { 'hero-code': 0.9, 'hero-model': 2.1, 'hero-lut': 2.2, 'hero-compile': 0.3 };

const FADE_IN_S = 0.5;

/**
 * The 3D products over the hero and over its copy at the end of the page (`[data-hero-target]`, the Figma
 * render's box, also the no-WebGL fallback): the intro plays on load, scrolling scrubs the rest.
 */
export class HeroSceneElement extends KelvElement {
  private scene: Scene | null = null;
  private introStart: number | null = null;
  private reducedMotion = false;
  private targets: HTMLElement[] = [];
  private targetsVersion = -1;
  private last = {
    time: -1,
    drawnAt: -Infinity,
    width: 0,
    height: 0,
    left: 0,
    frameWidth: 0,
    scale: 1,
    x: Number.NaN,
    y: Number.NaN,
    visible: false,
  };

  protected mount() {
    const canvas = this.querySelector('canvas')!;
    const root = document.documentElement;
    this.reducedMotion = prefersReducedMotion();
    addTasks(TASKS);
    let disposed = false;

    import('@/scene/hero-scene')
      .then(({ createHeroScene }) => {
        finishTask('hero-code');
        return createHeroScene(canvas);
      })
      .then((created) => {
        if (disposed) return created.dispose();
        this.scene = created;
        if (import.meta.env.DEV) Object.assign(window, { __kelvHero: created, __LOOK: LOOK });
        this.last.width = 0;
        root.classList.add('has-3d');
      })
      .catch((error: unknown) => {
        for (const task of Object.keys(TASKS)) finishTask(task);
        root.classList.add('no-3d');
        console.error('[hero scene]', error);
      });

    this.cleanup(() => {
      disposed = true;
      this.scene?.dispose();
      this.scene = null;
      root.classList.remove('has-3d');
    });
    this.frame((now) => this.draw(canvas, now));
  }

  /** The hero and its copy can be re-rendered by the theme editor: looked up again after a layout change. */
  private currentTargets() {
    if (this.targetsVersion !== layoutVersion()) {
      this.targetsVersion = layoutVersion();
      this.targets = [...document.querySelectorAll<HTMLElement>('[data-hero-target]')];
    }
    return this.targets;
  }

  private draw(canvas: HTMLCanvasElement, now: number) {
    const current = this.scene;
    if (!current) return;
    const state = this.last;
    const { height: viewport, clientWidth } = viewportSize();

    const target = isLayerPage()
      ? undefined
      : this.currentTargets().find((element) => {
          const rect = viewRect(element);
          return rect.bottom > 0 && rect.top < viewport;
        });

    if (state.visible !== Boolean(target)) {
      state.visible = Boolean(target);
      canvas.classList.toggle('is-visible', state.visible);
    }
    if (!target) return;
    const box = viewRect(target);

    const dpr = pixelRatio();
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const frameWidth = snap(box.width);
    const height = snap(box.height);
    // Only the part of the frame inside the screen is drawn (on phones it is much wider than the screen).
    const left = snap(Math.max(0, -box.left));
    const width = Math.min(frameWidth - left, snap(clientWidth - box.left - left));
    if (width <= 0) return;
    const scale = renderScale();
    const changed = width !== state.width || height !== state.height || left !== state.left;
    if (changed || frameWidth !== state.frameWidth || scale !== state.scale) {
      Object.assign(state, { width, height, left, frameWidth, scale });
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      current.setSize(width, height, dpr * scale, left, frameWidth);
      state.time = -1;
    }
    // Placed on the page, not on the screen: the browser scrolls it with the hero (native touch scrolling too).
    const x = snap(box.left + left);
    const y = snap(box.top + frameScroll());
    if (x !== state.x || y !== state.y) {
      state.x = x;
      state.y = y;
      canvas.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    if (this.introStart === null && isReady()) this.introStart = now;
    const elapsed = this.introStart === null ? 0 : (now - this.introStart) / 1000;
    const intro = this.reducedMotion ? INTRO_DURATION : Math.min(INTRO_DURATION, elapsed);
    canvas.style.opacity = String(clamp01(elapsed / FADE_IN_S));

    const section = viewRect(target.parentElement ?? target);
    const progress = clamp01(-section.top / section.height);
    const time = Math.round((intro + progress * (current.duration - REST_TIME)) * 1000) / 1000;

    if (time === state.time || now - state.drawnAt < sceneFrameMs()) return;
    state.time = time;
    state.drawnAt = now;
    current.setTime(time);
    current.render();
    markRendered();
  }
}
