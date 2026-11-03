import { KelvElement } from '@/lib/element';
import { frameScroll, layoutVersion, viewRect, viewRectInSticky, viewportSize } from '@/lib/layout';
import { clamp01, designScale, easeInOutCubic, easeOutCubic, isMobile, lerp, mobileUnit } from '@/lib/math';
import { ProductCanvas } from './product-canvas';

/**
 * Centre offset from the screen centre (design px) and in-plane angle (deg). On 07 the product hangs
 * under the form (`y` is then the gap from the form's bottom to the product's centre) and rises with it.
 */
const POSES = {
  join: { x: -5.85, y: 380, angle: 10.03 },
  middle: { x: -8.7, y: -6, angle: -15 },
  footer: { x: -10.85, y: -56.15, angle: 10.03 },
};
// Phones: under the form on 07, centred on 08, over the footer's title on 09 (mobile design px).
const MOBILE_POSES = {
  join: { x: 0, y: 235, angle: 10.03 },
  middle: { x: 0, y: 0, angle: -15 },
  footer: { x: 0, y: 0, angle: 10.03 },
};
/** Share of section 7's pinned scroll at which the product starts rising from below the screen. */
const APPEAR_AT = 0.3;
/** Turns it makes while it rises to under the form. */
const APPEAR_TURNS = 1;
/** Screen share over which the product fades out once the footer starts leaving. */
const FADE_OUT = 0.45;

// Zone 8's glow grows from its design size until it covers the zone's background (the user's request: no white space).
const GLOW_FROM = { scale: 0.85, y: 0.25 };
const GLOW_TO = { scale: 1.9, y: -0.2 };

/**
 * Zone 8, and the K1 bottle that appears on 07, turns through 08 and lands in the footer, one full turn per
 * stage. It follows #join, #travel and #footer, wherever their sections are.
 */
export class Travel extends KelvElement {
  private stage!: ProductCanvas;
  private state = { ctaOff: false, fade: 1, glow: -1, size: 0, version: -1 };
  private join: HTMLElement | null = null;
  private zone: HTMLElement | null = null;
  private footer: HTMLElement | null = null;
  private form: HTMLElement | null = null;

  protected mount() {
    const product = this.ref('product')!;
    const reveal = this.ref('reveal')!;
    const spin = this.ref('spin')!;
    const glow = this.ref('glow')!;
    this.stage = new ProductCanvas(
      reveal.querySelector('canvas')!,
      ['K1_COOL_Foam'],
      { task: 'travel-compile', weight: 0.1 },
      () => reveal.classList.add('is-3d'),
    );
    this.cleanup(() => {
      this.stage.dispose();
      document.documentElement.classList.remove('cta-off');
    });
    this.frame(() => {
      this.lookup(product);
      this.moveGlow(glow);
      this.moveProduct(product, spin);
    });
  }

  /** The sections it follows can be re-rendered by the theme editor: looked up again after a layout change. */
  private lookup(product: HTMLElement) {
    const s = this.state;
    if (s.version === layoutVersion()) return;
    s.version = layoutVersion();
    s.size = product.offsetHeight;
    this.join = document.getElementById('join');
    this.zone = document.getElementById('travel');
    this.footer = document.getElementById('footer');
    this.form = this.join?.querySelector('.join__form') ?? null;
  }

  private moveGlow(glow: HTMLElement) {
    if (!this.zone) return;
    const vh = viewportSize().height;
    const rect = viewRect(this.zone);
    if (rect.bottom < -vh || rect.top > vh) return;
    const p = clamp01((vh - rect.top) / rect.height);
    if (Math.abs(p - this.state.glow) < 1e-4) return;
    this.state.glow = p;
    const scale = lerp(GLOW_FROM.scale, GLOW_TO.scale, p);
    const y = lerp(GLOW_FROM.y, GLOW_TO.y, p) * 100;
    glow.style.transform = `translateY(${y.toFixed(2)}%) scale(${scale.toFixed(4)})`;
  }

  private moveProduct(el: HTMLElement, spinBox: HTMLElement) {
    if (!this.join || !this.zone || !this.footer) return;
    const j = viewRect(this.join);
    const z = viewRect(this.zone);
    const f = viewRect(this.footer);
    const s = this.state;
    const vh = viewportSize().height;
    const y = frameScroll();

    const pinned = j.height - vh;
    const pin = pinned > 0 ? clamp01(-j.top / pinned) : 0;
    const shown = pin > APPEAR_AT;
    // Scrubbed by the scroll: it rises from below the screen to under the form, turning.
    const rise = easeOutCubic(clamp01((pin - APPEAR_AT) / (1 - APPEAR_AT)));

    const mobile = isMobile();
    const poses = mobile ? MOBILE_POSES : POSES;
    const start = y + j.bottom - vh;
    const middle = y + z.top + z.height / 2 - vh / 2;
    const end = y + f.top;
    const scale = mobile ? mobileUnit() : designScale();
    const sticky = this.form?.parentElement;
    const form = this.form && sticky ? viewRectInSticky(this.form, sticky) : null;
    const below = (vh / 2 + s.size / 2) / scale;
    const underForm = { ...poses.join, y: (form ? form.bottom - vh / 2 : 0) / scale + poses.join.y };
    underForm.y = lerp(Math.max(below, underForm.y), underForm.y, rise);
    let from = underForm;
    let to = underForm;
    let t = 0;
    let turns = -APPEAR_TURNS * (1 - rise);
    if (y > start && y <= middle) {
      to = poses.middle;
      t = easeInOutCubic(clamp01((y - start) / (middle - start)));
      turns = t;
    } else if (y > middle) {
      from = poses.middle;
      to = poses.footer;
      t = easeInOutCubic(clamp01((y - middle) / (end - middle)));
      turns = 1 + t;
    }

    // Held while the footer is pinned, then it travels up with it and fades before reaching the hero copy.
    const past = Math.max(0, y - end - (f.height - vh));
    const fade = 1 - easeInOutCubic(clamp01(past / (vh * FADE_OUT)));
    if (fade !== s.fade) {
      s.fade = fade;
      el.style.opacity = fade < 1 ? fade.toFixed(3) : '';
    }
    el.style.setProperty('--tp-x', `${(lerp(from.x, to.x, t) * scale).toFixed(2)}px`);
    // It never rises above the form while the form is still on screen.
    const ty = y > middle ? lerp(from.y, to.y, t) : Math.max(lerp(from.y, to.y, t), underForm.y);
    el.style.setProperty('--tp-y', `${(ty * scale - past).toFixed(2)}px`);
    const angle = lerp(from.angle, to.angle, t);
    if (!this.stage.ready) {
      el.style.setProperty('--tp-a', `${angle.toFixed(3)}deg`);
      spinBox.style.setProperty('--tp-spin', `${(turns * 360).toFixed(2)}deg`);
    } else if (shown && fade > 0) {
      el.style.removeProperty('--tp-a');
      // Rolled in 3D, not by CSS: a rotated canvas would be resampled.
      this.stage.draw('K1_COOL_Foam', { spin: turns * Math.PI * 2, tiltX: 0, tiltY: 0, roll: (angle * Math.PI) / 180 });
    }

    // The footer frame has no CTAs.
    const ctaOff = f.top < vh * 0.5 && f.bottom > vh * 0.5;
    if (ctaOff !== s.ctaOff) {
      s.ctaOff = ctaOff;
      document.documentElement.classList.toggle('cta-off', ctaOff);
    }
  }
}
