import { measureTicks, resolveLength, snapToDevicePixels, watchPixelRatio } from '@/lib/css';
import { clamp01 } from '@/lib/math';
import { onFrame } from '@/lib/scroll';

/**
 * The tick bar of the header and the preloader (`.ticks`), snapped to device pixels so all ticks match.
 * `data-top-token` names the length token of its top edge (the side padding by default).
 */
export function startTickBar(bar: HTMLElement, progress: () => number) {
  const host = bar.parentElement!;
  const topToken = bar.dataset.topToken ?? '--pad-edge';
  let total = 0;
  let lit = -1;

  const measure = () => {
    const dpr = window.devicePixelRatio || 1;
    const { width, pitch, height } = measureTicks(host, '--tick');
    const pad = resolveLength(host, '--pad-edge');
    const room = Math.floor((document.documentElement.clientWidth - 2 * pad) * dpr) / dpr;
    const y = snapToDevicePixels(resolveLength(host, topToken));
    const style = bar.style;
    style.setProperty('--tk-w', `${width}px`);
    style.setProperty('--tk-p', `${pitch}px`);
    style.setProperty('--tk-h', `${height}px`);
    style.setProperty('--tk-y', `${y}px`);
    total = Math.floor((room - width) / pitch) + 1;
    // Only whole ticks (a cut-off last one could never light up), centred so both ends match the margins.
    const length = (total - 1) * pitch + width;
    const x = snapToDevicePixels(pad + (room - length) / 2);
    style.setProperty('--tk-x', `${x}px`);
    style.setProperty('--tk-len', `${length}px`);
    lit = -1;
  };

  measure();
  window.addEventListener('resize', measure);
  const unwatch = watchPixelRatio(measure);
  const unsubscribe = onFrame(() => {
    const next = Math.round(clamp01(progress()) * total);
    if (next === lit) return;
    lit = next;
    bar.style.setProperty('--ticks-lit', String(next));
  });

  return () => {
    window.removeEventListener('resize', measure);
    unwatch();
    unsubscribe();
  };
}
