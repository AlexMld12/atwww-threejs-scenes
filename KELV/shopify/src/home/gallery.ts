import { setChromeVar } from '@/chrome/chrome-vars';
import { KelvElement } from '@/lib/element';
import { viewRect, viewportSize } from '@/lib/layout';
import { clamp01, smoothstep } from '@/lib/math';
import { isLayerPage } from '@/lib/page-layers';
import { addTasks, finishTask } from '@/lib/preload';
import { isTouch, markRendered, onRenderScale, pixelRatio, renderScale, sceneFrameMs } from '@/lib/quality';
import { WISDOM_LOOK } from '@/scene/wisdom-config';
import type { WisdomScene } from '@/scene/wisdom-scene';

const TASKS = { 'wisdom-code': 0.05, 'wisdom-model': 1.84, 'wisdom-compile': 0.3, 'hero-lut': 2.2 };

const LERP = 0.1;
const CENTRE_END = 0.35;
const ZOOM_SLOW_END = 0.45;
const ZOOM_END = 0.92;
const ZOOM_SLOW_SHARE = 0.15;
// On Ancient Wisdom: the CTAs rise to the middle, then the text.
const CTA_FROM = 0.64;
const CTA_LENGTH = 0.1;
const TEXT_FROM = 0.76;
const TEXT_LENGTH = 0.12;

// Shares of the full-screen resolution: the smallest one with 1.5 canvas pixels per drawn pixel (as sharp as full).
const DETAIL = [0.5, 0.75, 1];
const OVERSAMPLE = 1.5;
const DETAIL_HYSTERESIS = 1.15;
// Phones: the navy mask covers the scene 70 % at full size, so 1.5 device pixels per pixel read as sharp (−35 % GPU time).
const TOUCH_DPR = 1.5;

const detailFor = (shown: number) => DETAIL.find((d) => d >= shown * OVERSAMPLE) ?? 1;

// Slow cubic start, then a cubic ease-out until the scene covers the screen.
function zoomCurve(e: number) {
  if (e <= ZOOM_SLOW_END) return Math.pow(e / ZOOM_SLOW_END, 3) * ZOOM_SLOW_SHARE;
  const t = clamp01((e - ZOOM_SLOW_END) / (ZOOM_END - ZOOM_SLOW_END));
  return ZOOM_SLOW_SHARE + (1 - ZOOM_SLOW_SHARE) * (1 - Math.pow(1 - t, 3));
}

function setOpacity(element: HTMLElement, value: string) {
  if (element.style.opacity !== value) element.style.opacity = value;
}

/**
 * 05–06: the grid zooms into the Ancient Wisdom scene (REF_129, in the middle tile), then Ancient Wisdom fades
 * in (drinksom.eu "origin"). The scene is drawn at the size the tile reaches when it covers the screen and
 * scaled down into it, so it is sharp at the end of the zoom; while the tile is smaller it renders fewer pixels.
 */
export class Gallery extends KelvElement {
  private section!: HTMLElement;
  private zoom!: HTMLElement;
  private tile!: HTMLElement;
  private mask!: HTMLElement;
  private screenMask!: HTMLElement;
  private wisdom!: HTMLElement;
  private text!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private scene: WisdomScene | null = null;
  private progress = 0;
  private zoomScale = 1;
  private state = { eased: 0, wordsIn: false, shift: -1, frame: { w: 1, h: 1, cy: 0 } };
  private sceneState = { time: -1, drawnAt: -Infinity, width: 0, height: 0, ratio: 0, detail: 0, tileWidth: 0 };

  protected mount() {
    this.section = this.querySelector('.gallery')!;
    this.zoom = this.ref('zoom')!;
    this.tile = this.ref('tile')!;
    this.mask = this.ref('mask')!;
    this.screenMask = this.ref('screen-mask')!;
    this.wisdom = this.ref('wisdom')!;
    this.text = this.ref('text')!;
    this.canvas = this.ref<HTMLCanvasElement>('scene')!;

    this.measure();
    this.listen(window, 'resize', () => this.measure());
    for (const word of this.text.querySelectorAll('.sw-in')) word.classList.add('is-below');
    this.cleanup(() => setChromeVar('--cta-shift', null));

    this.startScene();
    // The scene draws first, with the progress of the frame before (as in web/).
    this.frame((now) => {
      this.drawScene(now);
      this.tick();
    });
  }

  private measure() {
    const { tile, zoom } = this;
    const frame = { w: tile.offsetWidth, h: tile.offsetHeight, cy: tile.offsetTop + tile.offsetHeight / 2 };
    this.state.frame = frame;
    zoom.style.transformOrigin = `${tile.offsetLeft + frame.w / 2}px ${frame.cy}px`;
  }

  private startScene() {
    addTasks(TASKS);
    let disposed = false;
    const resize = () => this.resizeScene();
    this.listen(window, 'resize', resize);
    this.cleanup(onRenderScale(resize));

    import('@/scene/wisdom-scene')
      .then(({ createWisdomScene }) => {
        finishTask('wisdom-code');
        return createWisdomScene(this.canvas);
      })
      .then((created) => {
        if (disposed) return created.dispose();
        this.scene = created;
        this.resizeScene();
        this.canvas.classList.add('is-ready');
        if (import.meta.env.DEV) Object.assign(window, { __kelvWisdom: created, __WISDOM_LOOK: WISDOM_LOOK });
      })
      .catch((error: unknown) => {
        for (const task of Object.keys(TASKS)) finishTask(task);
        console.error('[wisdom scene]', error);
      });

    this.cleanup(() => {
      disposed = true;
      this.scene?.dispose();
      this.scene = null;
    });
  }

  // Sized ahead (during the preloader), so entering the section does not reallocate the render targets.
  private resizeScene() {
    const scene = this.scene;
    if (!scene) return;
    const state = this.sceneState;
    const w = this.tile.offsetWidth;
    const h = this.tile.offsetHeight;
    const dpr = isTouch() ? Math.min(pixelRatio(), TOUCH_DPR) : pixelRatio();
    const scale = Math.max(window.innerWidth / w, window.innerHeight / h);
    const width = Math.round(w * scale * dpr) / dpr;
    const height = Math.round(h * scale * dpr) / dpr;
    state.tileWidth = w;
    if (!state.detail) state.detail = detailFor((w * this.zoomScale) / width);
    const ratio = dpr * state.detail * renderScale();
    if (width === state.width && height === state.height && ratio === state.ratio) return;
    Object.assign(state, { width, height, ratio, time: -1 });
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.style.transform = `scale(${w / width}, ${h / height})`;
    scene.setSize(width, height, ratio);
    scene.render();
  }

  private tick() {
    const s = this.state;
    const { width: vw, height: vh } = viewportSize();
    const rect = viewRect(this.section);
    const span = rect.height - vh;
    const raw = span > 0 ? clamp01(-rect.top / span) : 0;
    s.eased = Math.abs(raw - s.eased) > 1e-4 ? s.eased + (raw - s.eased) * LERP : raw;
    const e = s.eased;
    // The scene plays from when the grid, centred, zooms into it to the end of the section.
    this.progress = clamp01((e - CENTRE_END) / (1 - CENTRE_END));

    const centre = smoothstep(clamp01(e / CENTRE_END));
    const grow = zoomCurve(e);
    const { frame } = s;
    const scale = 1 + (Math.max(vw / frame.w, vh / frame.h) - 1) * grow;
    this.zoomScale = scale;
    this.zoom.style.transform = `translateY(${(-(frame.cy - vh / 2) * centre).toFixed(2)}px) scale(${scale.toFixed(4)})`;

    // Over the scene the two masks compose to 5 % → 70 %; at full size only the screen mask is left.
    const screenOpacity = 0.7 * grow;
    const tileOpacity = Math.max(0, 1 - (1 - (0.05 + 0.65 * grow)) / (1 - screenOpacity));
    // Plain opacity, not a custom property: those restyle every descendant (all the words of the text).
    setOpacity(this.screenMask, screenOpacity.toFixed(4));
    setOpacity(this.mask, tileOpacity.toFixed(4));
    setOpacity(this.wisdom, clamp01((e - TEXT_FROM) / TEXT_LENGTH).toFixed(3));

    const wordsProgress = clamp01((raw - TEXT_FROM) / TEXT_LENGTH);
    const words = () => this.text.querySelectorAll<HTMLElement>('.sw-in');
    if (wordsProgress > 0.05 && !s.wordsIn) {
      s.wordsIn = true;
      words().forEach((word, i) => {
        word.style.transitionDelay = `${0.15 + 0.03 * i}s`;
        word.classList.replace('is-below', 'is-enter');
      });
    } else if (wordsProgress === 0 && s.wordsIn) {
      s.wordsIn = false;
      for (const word of words()) {
        word.classList.remove('is-enter');
        word.style.transitionDelay = '';
        word.classList.add('is-below');
      }
    }

    // The CTAs go back down while the next section's edge rises from the bottom to the middle.
    const leaving = clamp01((rect.bottom - vh * 0.5) / (vh * 0.5));
    const rise = rect.top < vh * 0.5 ? clamp01((e - CTA_FROM) / CTA_LENGTH) * leaving : 0;
    const shift = smoothstep(rise);
    if (Math.abs(shift - s.shift) > 1e-4) {
      s.shift = shift;
      setChromeVar('--cta-shift', shift.toFixed(4));
    }
  }

  private drawScene(now: number) {
    const scene = this.scene;
    if (!scene || isLayerPage()) return;
    const vh = viewportSize().height;
    const rect = viewRect(this.section);
    if (rect.bottom <= 0 || rect.top >= vh) return;

    const state = this.sceneState;
    // The tile's width on screen (the gallery's zoom scales it) over the canvas' full width.
    const shown = state.width ? (state.tileWidth * this.zoomScale) / state.width : 1;
    const detail = detailFor(shown);
    // Steps down only well below the threshold, so scrolling back and forth on it does not reallocate.
    if (detail > state.detail || detailFor(shown * DETAIL_HYSTERESIS) < state.detail) {
      state.detail = detail;
      this.resizeScene();
    }
    const time = Math.round(clamp01(this.progress) * scene.duration * 1000) / 1000;
    if (time === state.time || now - state.drawnAt < sceneFrameMs()) return;
    state.time = time;
    state.drawnAt = now;
    scene.setTime(time);
    scene.render();
    markRendered();
  }
}
