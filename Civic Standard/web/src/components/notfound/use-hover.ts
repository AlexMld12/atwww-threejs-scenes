import { useEffect, type RefObject } from 'react';

// The 404's words hover as a craft looking for its balance: each bobs slowly on its own beat and, every 1.2–3 s,
// leans to a new point a few px away, which a soft spring overshoots and settles on. Moved by left / top (style
// properties --dx / --dy), not a transform, so the words stay sharp.
const BOB = { x: 1.5, y: 4 }; // px
const LEAN = { x: 5, y: 4 }; // px, the farthest a new point is
const SPRING = { frequency: 1.4, damping: 0.3 }; // Hz, ratio: under one, it overshoots
const LEAN_MS = [1200, 3000];

export function useHover(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const labels = [...root.current!.querySelectorAll<HTMLElement>('.nf__label')].map((element) => ({
      element,
      phase: Math.random() * Math.PI * 2,
      beat: 0.35 + Math.random() * 0.2,
      position: { x: 0, y: 0 },
      speed: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      next: 0,
    }));
    const omega = 2 * Math.PI * SPRING.frequency;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      const t = now / 1000;
      for (const label of labels) {
        if (now >= label.next) {
          label.target = { x: (Math.random() * 2 - 1) * LEAN.x, y: (Math.random() * 2 - 1) * LEAN.y };
          label.next = now + LEAN_MS[0] + Math.random() * (LEAN_MS[1] - LEAN_MS[0]);
        }
        for (const axis of ['x', 'y'] as const) {
          const pull = omega * omega * (label.target[axis] - label.position[axis]);
          label.speed[axis] += (pull - 2 * SPRING.damping * omega * label.speed[axis]) * dt;
          label.position[axis] += label.speed[axis] * dt;
        }
        const angle = t * label.beat * Math.PI * 2 + label.phase;
        const x = label.position.x + BOB.x * Math.sin(angle * 0.7);
        const y = label.position.y + BOB.y * Math.sin(angle);
        label.element.style.setProperty('--dx', `${x.toFixed(2)}px`);
        label.element.style.setProperty('--dy', `${y.toFixed(2)}px`);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [root]);
}
