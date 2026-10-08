import type { CSSProperties } from 'react';

/** Inline style that also accepts CSS custom properties. */
export type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/** Reads a length token (e.g. `--tick-w`) in CSS px by measuring a probe inside `host`. */
export function resolveLength(host: HTMLElement, token: string) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;width:var(${token})`;
  host.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

/** Rounds a CSS length to whole device pixels, at least one. */
export function snapToDevicePixels(value: number) {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(1, Math.round(value * dpr)) / dpr;
}

/** Tick width, pitch and height from `<prefix>-w`, `-pitch`, `-h`, snapped to whole device pixels. */
export function measureTicks(host: HTMLElement, prefix: string) {
  return {
    width: snapToDevicePixels(resolveLength(host, `${prefix}-w`)),
    pitch: snapToDevicePixels(resolveLength(host, `${prefix}-pitch`)),
    height: snapToDevicePixels(resolveLength(host, `${prefix}-h`)),
  };
}

/** Calls `callback` whenever devicePixelRatio changes (browser zoom, moving to another screen). */
export function watchPixelRatio(callback: () => void) {
  let query: MediaQueryList;
  const listen = () => {
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener('change', onChange, { once: true });
  };
  const onChange = () => {
    callback();
    listen();
  };
  listen();
  return () => query.removeEventListener('change', onChange);
}
