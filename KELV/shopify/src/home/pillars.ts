import { KelvElement } from '@/lib/element';
import { viewRect, viewportSize } from '@/lib/layout';
import { clamp01, designScale, easeInOutCubic, easeInOutSine, isMobile, lerp, mobileUnit } from '@/lib/math';
import type { ProductName } from '@/scene/product-config';
import { ProductCanvas } from './product-canvas';

/** The texts of a pillar, from the section's blocks (sections/pillars.liquid). */
interface PillarText {
  a: string;
  b: string;
  desc: string;
  /** The line under the product: its step, then what it does. */
  tag: string;
  accent: string;
  /** The product's picture, shown until its 3D model is ready. */
  face: string;
}

/** The fixed part of each pillar, in block order: `y` puts the bottle's own centre on the screen's centre. */
const STAGES: { model: ProductName; y: number; rings: { x: number; y: number; r: number }[] }[] = [
  { model: 'K1_COOL_Foam', y: -12.58, rings: [{ x: 209, y: 309, r: 651.5 }] },
  { model: 'K2_CALM_Serum', y: -36.11, rings: [] },
  {
    model: 'K3_SEAL_Cream',
    y: -36.11,
    rings: [
      { x: -193.5, y: 106.5, r: 431 },
      { x: 351, y: 283, r: 487.5 },
    ],
  },
];

// One scale and one centre line for all three, so they stand in the same place (the client's request).
const PRODUCT_SIZE = 805.4;
const DEG = Math.PI / 180;
const TILT_MAX = 18;
const TILT_EASE = 0.12;
const CLICK_SPIN_S = 1.2;
// One turn per transition over most of the segment, so it can be followed; the product swaps when
// the bottle passes side-on (270°), independently of the texts' swap at B = 0.5.
const SPIN_FROM = 0.1;
const SPIN_EASE = 0.1;
const RING_FADE_MS = 400;
const ENTER_DELAY_S = 0.15;
// On phones the whole stage (product, rings) is the desktop one at this share of the mobile unit.
const MOBILE_STAGE = 0.56;
const SVG = 'http://www.w3.org/2000/svg';

const pillarId = (index: number) => String(index + 1).padStart(2, '0');

/** Each word (or line) of a text in its own clipped window, as snippets/words.liquid and lines.liquid. */
function windows(parts: string[], line: boolean, state: string) {
  return parts.flatMap((part, i) => {
    const win = document.createElement('span');
    win.className = line ? 'sw-win sw-win--line' : 'sw-win';
    const inner = document.createElement('span');
    inner.className = state ? `sw-in ${state}` : 'sw-in';
    inner.textContent = part;
    win.append(inner);
    return !line && i < parts.length - 1 ? [win, ' '] : [win];
  });
}

/** 02–04 (drinksom power-pillars): everything swaps at B = 0.5, while the product is edge-on. */
export class Pillars extends KelvElement {
  private pillars: PillarText[] = [];
  private section!: HTMLElement;
  private sticky!: HTMLElement;
  private zoom!: HTMLElement;
  private backgrounds: HTMLElement[] = [];
  private rings: SVGSVGElement[][] = [];
  private titleBox!: HTMLElement;
  private titleA!: HTMLElement;
  private titleB!: HTMLElement;
  private number!: HTMLElement;
  private desc!: HTMLElement;
  private tag!: HTMLElement;
  private product!: HTMLElement;
  private spinBox!: HTMLElement;
  private faces: HTMLImageElement[] = [];
  private stage!: ProductCanvas;
  private state = {
    on: false,
    visible: -1,
    shown: 0,
    ringsFor: -1,
    zoom: -1,
    tilt: { x: 0, y: 0, targetX: 0, targetY: 0 },
    spin: Number.NaN,
    clickStart: -1,
    swapTimer: 0 as ReturnType<typeof setTimeout> | number,
  };

  protected mount() {
    this.pillars = JSON.parse(this.ref('data')?.textContent ?? '[]');
    if (!this.pillars.length) return;
    this.section = this.querySelector('.pillars')!;
    this.sticky = this.ref('sticky')!;
    this.zoom = this.ref('zoom')!;
    this.backgrounds = [...this.zoom.querySelectorAll<HTMLElement>('.pillar-bg')];
    this.titleBox = this.ref('title')!;
    this.titleA = this.ref('title-a')!;
    this.titleB = this.ref('title-b')!;
    this.number = this.ref('id')!;
    this.desc = this.querySelector('.pillar-copy__desc')!;
    this.tag = this.querySelector('.pillar-tag')!;
    this.product = this.ref('product')!;
    this.spinBox = this.ref('spin')!;
    this.faces = [...this.spinBox.querySelectorAll('img')];
    this.drawRings(this.ref('rings')!);

    for (const pillar of this.pillars) {
      const image = new Image();
      image.src = pillar.face;
      image.decode().catch(() => {});
    }

    const models = this.stages().map((stage) => stage.model);
    this.stage = new ProductCanvas(
      this.product.querySelector('canvas')!,
      models,
      { task: 'pillars-compile', weight: 0.15 },
      () => this.product.classList.add('is-3d'),
    );
    this.cleanup(() => {
      clearTimeout(this.state.swapTimer);
      this.stage.dispose();
    });

    // The touched side tilts away, as if pushed.
    const hit = this.ref('hit')!;
    this.listen(hit, 'pointermove', (event) => {
      const { clientX, clientY } = event as PointerEvent;
      const rect = hit.getBoundingClientRect();
      const nx = clamp01((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = clamp01((clientY - rect.top) / rect.height) * 2 - 1;
      this.state.tilt.targetY = nx * TILT_MAX;
      this.state.tilt.targetX = -ny * TILT_MAX;
    });
    this.listen(hit, 'pointerleave', () => {
      this.state.tilt.targetX = 0;
      this.state.tilt.targetY = 0;
    });
    this.listen(hit, 'click', () => {
      this.state.clickStart = performance.now();
    });

    this.frame((now) => this.tick(now));
  }

  /** The stages of the pillars on the page (the editor may hold fewer than three). */
  private stages() {
    return STAGES.slice(0, this.pillars.length);
  }

  private drawRings(host: HTMLElement) {
    this.rings = this.stages().map((stage) =>
      stage.rings.map((ring) => {
        const svg = document.createElementNS(SVG, 'svg');
        svg.classList.add('pillar-ring');
        svg.setAttribute('viewBox', `0 0 ${2 * ring.r} ${2 * ring.r}`);
        svg.style.setProperty('--rx', `calc(${ring.x} * var(--pl-u))`);
        svg.style.setProperty('--ry', `calc(${ring.y} * var(--pl-u))`);
        svg.style.setProperty('--rr', `calc(${ring.r} * var(--pl-u))`);
        const circle = document.createElementNS(SVG, 'circle');
        for (const [name, value] of [
          ['cx', ring.r],
          ['cy', ring.r],
          ['r', ring.r],
          ['pathLength', 1],
          ['stroke-width', 1],
        ]) {
          circle.setAttribute(String(name), String(value));
        }
        svg.append(circle);
        host.append(svg);
        return svg;
      }),
    );
  }

  private showRings(index: number) {
    const s = this.state;
    if (s.ringsFor === index) return;
    s.ringsFor = index;
    this.rings.forEach((rings, i) => {
      for (const ring of rings) {
        if (i === index) {
          ring.classList.remove('is-gone', 'is-drawn');
          ring.getBoundingClientRect();
          requestAnimationFrame(() => ring.classList.add('is-drawn'));
        } else if (ring.classList.contains('is-drawn')) {
          ring.classList.add('is-gone');
          setTimeout(() => ring.classList.contains('is-gone') && ring.classList.remove('is-drawn'), RING_FADE_MS);
        }
      }
    });
  }

  private setTitle(pillar: PillarText) {
    this.titleA.textContent = pillar.a;
    this.titleB.textContent = pillar.b;
    this.titleBox.style.setProperty('--pl-accent', pillar.accent);
  }

  private setDescription(index: number, state = '') {
    this.desc.replaceChildren(...windows(this.pillars[index].desc.trim().split(/\s+/), false, state));
  }

  private setTagline(index: number, state = '') {
    const lines = this.pillars[index].tag
      .trim()
      .split('\n')
      .map((line) => line.trim());
    this.tag.replaceChildren(...windows(lines, true, state));
  }

  private setStatic(index: number) {
    this.setTitle(this.pillars[index]);
    this.setDescription(index);
    this.setTagline(index);
    this.number.textContent = pillarId(index);
    for (const word of this.sticky.querySelectorAll('.sw-in')) {
      word.classList.remove('is-out', 'is-below', 'is-enter');
    }
    this.state.shown = index;
  }

  /** Title comes back from blur in place; words slide out up, then the new ones in from below. */
  private swapTo(index: number) {
    const s = this.state;
    this.setTitle(this.pillars[index]);
    const titleRows = [this.titleA, this.titleB];
    for (const row of titleRows) row.classList.add('is-swap');
    this.titleBox.getBoundingClientRect();
    for (const row of titleRows) row.classList.remove('is-swap');

    const groups = [this.desc, this.tag];
    clearTimeout(s.swapTimer);
    let outDuration = 0;
    groups.forEach((group, g) => {
      const delay = g * 0.06;
      const parts = [...group.querySelectorAll<HTMLElement>('.sw-in')];
      parts.forEach((part, j) => {
        part.classList.remove('is-enter', 'is-below');
        part.style.transitionDelay = `${delay + 0.015 * j}s`;
        part.classList.add('is-out');
      });
      outDuration = Math.max(outDuration, delay + 0.25 + 0.015 * Math.max(0, parts.length - 1));
    });

    s.swapTimer = setTimeout(() => {
      this.number.textContent = pillarId(index);
      this.setDescription(index, 'is-below');
      this.setTagline(index, 'is-below');
      for (const group of groups) {
        const parts = [...group.querySelectorAll<HTMLElement>('.sw-in')];
        for (const part of parts) part.classList.replace('is-out', 'is-below');
        group.getBoundingClientRect();
        parts.forEach((part, j) => {
          part.style.transitionDelay = `${0.03 * j}s`;
          part.classList.replace('is-below', 'is-enter');
        });
      }
      s.shown = index;
    }, outDuration * 1000);
  }

  /** The first pillar comes in as the swaps do: the title from blur in place, the words up from their lines. */
  private enterTexts() {
    const titleRows = [this.titleA, this.titleB];
    const groups = [this.desc, this.tag];
    for (const row of titleRows) row.classList.add('is-swap');
    for (const group of groups) {
      for (const part of group.querySelectorAll<HTMLElement>('.sw-in')) {
        part.classList.remove('is-out', 'is-enter');
        part.classList.add('is-below');
      }
    }
    this.sticky.getBoundingClientRect();
    for (const row of titleRows) row.classList.remove('is-swap');
    groups.forEach((group, g) => {
      group.querySelectorAll<HTMLElement>('.sw-in').forEach((part, j) => {
        part.style.transitionDelay = `${ENTER_DELAY_S + g * 0.06 + 0.03 * j}s`;
        part.classList.replace('is-below', 'is-enter');
      });
    });
  }

  private setOn(on: boolean) {
    const s = this.state;
    if (on === s.on) return;
    s.on = on;
    if (on) {
      this.sticky.classList.add('is-on');
      this.enterTexts();
      s.ringsFor = -1;
    } else {
      this.sticky.classList.remove('is-on');
      this.showRings(-1);
    }
  }

  private tick(now: number) {
    const s = this.state;
    const stages = this.stages();
    const n = stages.length;
    const viewport = viewportSize().height;
    const rect = viewRect(this.section);

    // The card fills the screen exactly when the section docks, the moment the product appears.
    const zoom = easeInOutSine(clamp01(1 - rect.top / viewport));
    if (Math.abs(zoom - s.zoom) > 1e-4) {
      s.zoom = zoom;
      this.zoom.style.setProperty('--e', zoom.toFixed(5));
    }

    const span = rect.height - viewport;
    const y = span > 0 ? clamp01(-rect.top / span) : 0;
    this.setOn(clamp01((viewport - rect.top) / viewport) >= 1);

    // A 30 % pause on pillar 1, then each transition (B) takes the last 35 % of its segment.
    const f = clamp01((y - 0.3) / 0.7);
    const position = (f <= 0.1 ? (f / 0.1) * 0.25 : 0.25 + ((f - 0.1) / 0.9) * 0.75) * n;
    const d = Math.min(n - 1, Math.floor(position));
    const last = d === n - 1;
    const b = last ? 0 : easeInOutCubic(clamp01((position - d - 0.65) / 0.35));

    for (let i = 1; i < n; i++) {
      const opacity = last ? Number(i === n - 1) : i === d ? 1 - b : i === d + 1 ? b : 0;
      this.backgrounds[i].style.opacity = String(opacity);
    }

    // Texts get a 0.47 / 0.53 hysteresis so a scroll stopped right at the middle does not flicker.
    const middle = !last && b >= 0.5 ? d + 1 : d;
    let wanted = middle;
    if (!last && s.visible === d + 1 && b > 0.47) wanted = d + 1;
    else if (s.visible === d && b < 0.53) wanted = d;
    if (wanted !== s.visible) {
      const first = s.visible === -1;
      s.visible = wanted;
      if (first || !s.on) this.setStatic(wanted);
      else if (wanted !== s.shown) this.swapTo(wanted);
    }
    const ready = this.stage.ready;
    if (!ready) {
      const src = this.pillars[middle].face;
      for (const face of this.faces) if (face.getAttribute('src') !== src) face.setAttribute('src', src);
    }
    if (s.on) this.showRings(s.visible);

    const from = stages[d];
    const to = stages[Math.min(d + 1, n - 1)];
    const scale = isMobile() ? MOBILE_STAGE * Math.min(mobileUnit(), viewport / 844) : designScale();
    const product = this.product.style;
    product.setProperty('--py', `${lerp(from.y, to.y, b) * scale}px`);
    product.setProperty('--ps', `${PRODUCT_SIZE * scale}px`);

    let click = 0;
    if (s.clickStart >= 0) {
      const t = (now - s.clickStart) / (CLICK_SPIN_S * 1000);
      if (t >= 1) s.clickStart = -1;
      else click = easeInOutCubic(t) * 360;
    }
    const tilt = s.tilt;
    tilt.x += (tilt.targetX - tilt.x) * TILT_EASE;
    tilt.y += (tilt.targetY - tilt.y) * TILT_EASE;
    // Turns add up across segments, so the damping never runs a turn backwards at a boundary.
    const turn = last ? 0 : easeInOutSine(clamp01((position - d - SPIN_FROM) / (1 - SPIN_FROM)));
    const target = (d + turn) * 360;
    s.spin = Number.isNaN(s.spin) || Math.abs(target - s.spin) < 0.01 ? target : s.spin + (target - s.spin) * SPIN_EASE;
    const spin = s.spin + click;
    if (ready) {
      if (rect.top < viewport && rect.bottom > 0) {
        const shown = Math.min(n - 1, Math.floor(s.spin / 360 + 0.25));
        // The touched side tilts away: CSS rotateX(+) is three's rotation.x(−).
        this.stage.draw(stages[shown].model, { spin: spin * DEG, tiltX: -tilt.x * DEG, tiltY: tilt.y * DEG });
      }
    } else {
      const style = this.spinBox.style;
      style.setProperty('--spin', `${spin}deg`);
      style.setProperty('--tx', `${tilt.x.toFixed(3)}deg`);
      style.setProperty('--ty', `${tilt.y.toFixed(3)}deg`);
    }
  }
}
