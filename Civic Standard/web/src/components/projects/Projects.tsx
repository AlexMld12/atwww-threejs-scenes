'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { createVirtualScroll } from '@/lib/virtual-scroll';
import { currentSlug, currentView, navigateSoft, subscribe } from '@/lib/routes';
import { projectIndex, projects } from './content';
import { ProjectPanel } from './ProjectPanel';

type Scene = Awaited<ReturnType<typeof import('@/scene/hero-scene').createHeroScene>>;

// a click, not a drag: the pointer moved less than this (px) and was down less than this (ms)
const TAP = { px: 6, ms: 500 };
const CLOSE_ICON = 'M0 0l9 9M9 0L0 9';

/**
 * OUR PROJECTS: the hero's tube as the whole page, with no end either way. Any picture the pointer finds opens its
 * project: the tube brings it to the front, it grows to the full screen (no page cover: the address changes under
 * it, navigateSoft) and the project's panel comes in beside it. Back, the × or Escape run it back into the ring; the
 * panel's arrows wipe the next picture in. No preloader: the logo is turning when the page comes in, and the rows
 * rise from below as on the home.
 */
export function Projects() {
  const view = useSyncExternalStore(subscribe, currentView, currentView);
  const slug = useSyncExternalStore(subscribe, currentSlug, currentSlug);
  const index = view === 'project' ? projectIndex(slug) : -1;

  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLElement>(null);
  const scene = useRef<Scene | null>(null);
  const [ready, setReady] = useState(false);
  // the panel keeps its project while it slides out; it is in once the picture has grown (`arrived`)
  const [shown, setShown] = useState(index);
  const [arrived, setArrived] = useState(false);
  if (index >= 0 && index !== shown) setShown(index);
  if (index < 0 && arrived) setArrived(false);
  // the project open in the scene, the panel it was clicked on, and whether that pushed the address (Back closes)
  const opened = useRef(-1);
  const picked = useRef<number | undefined>(undefined);
  const pushed = useRef(false);
  const enteredOnProject = useRef(index >= 0);
  const stepped = useRef(1);
  const down = useRef({ x: 0, y: 0, t: 0 });

  useEffect(() => {
    let alive = true;
    const scroll = createVirtualScroll(root.current!, () => opened.current < 0);
    import('@/scene/hero-scene')
      .then(({ createHeroScene }) =>
        createHeroScene(canvas.current!, getComputedStyle(document.documentElement).getPropertyValue('--paper'), {
          mode: 'projects',
          scroll: scroll.position,
          setScroll: scroll.set,
        }),
      )
      .then((created) => {
        if (!alive) return created.dispose();
        scene.current = created;
        fit();
        setReady(true);
      })
      .catch((error) => console.error(error));
    // the open picture fits what the panel leaves: the left of the screen, on a phone its top
    const fit = () => {
      const { offsetLeft, offsetTop } = panel.current!;
      const { clientWidth: width, clientHeight: height } = root.current!;
      if (offsetLeft > width * 0.3) scene.current?.setView(0, 0, offsetLeft, height);
      else scene.current?.setView(0, 0, width, offsetTop);
    };
    window.addEventListener('resize', fit);
    return () => {
      alive = false;
      window.removeEventListener('resize', fit);
      scroll.dispose();
      scene.current?.dispose();
      scene.current = null;
      document.documentElement.classList.remove('is-nav-away');
    };
  }, []);

  // the address leads: a project opens (grows from its panel), changes (the arrows) or closes (back into the ring)
  useEffect(() => {
    if (!ready) return;
    const was = opened.current;
    opened.current = index;
    document.documentElement.classList.toggle('is-nav-away', index >= 0);
    let current = true;
    if (index >= 0 && was < 0) {
      const instant = enteredOnProject.current;
      enteredOnProject.current = false;
      void scene.current!.open(index, picked.current, instant).then(() => {
        if (!current) return;
        setArrived(true);
        scene.current?.setFitted(true);
      });
      picked.current = undefined;
    } else if (index >= 0) {
      void scene.current!.change(index, stepped.current);
    } else if (was >= 0) {
      pushed.current = false;
      scene.current!.close();
    }
    return () => {
      current = false;
    };
  }, [ready, index]);

  const close = () => {
    if (pushed.current) window.history.back();
    else navigateSoft('projects');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && opened.current >= 0 && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPointerDown = (event: PointerEvent) => {
    down.current = { x: event.clientX, y: event.clientY, t: performance.now() };
  };
  const onPointerUp = (event: PointerEvent) => {
    // the panel and the × button handle their own
    if ((event.target as HTMLElement).closest('.pjp, .pj__close-button')) return;
    const moved = Math.hypot(event.clientX - down.current.x, event.clientY - down.current.y);
    if (moved > TAP.px || performance.now() - down.current.t > TAP.ms) return;
    if (opened.current >= 0) return close();
    const hit = scene.current?.pick(event.clientX, event.clientY);
    if (!hit || hit.project < 0) return;
    root.current!.style.cursor = '';
    picked.current = hit.cell;
    pushed.current = true;
    navigateSoft('project', projects[hit.project].slug);
  };

  // over a picture: a hand; over an open project: the × follows the pointer
  const hover = useRef(0);
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const { clientX, clientY } = event;
    cursor.current!.style.left = `${clientX}px`;
    cursor.current!.style.top = `${clientY}px`;
    if (hover.current) return;
    hover.current = requestAnimationFrame(() => {
      hover.current = 0;
      const over = opened.current < 0 ? scene.current?.pick(clientX, clientY) : null;
      root.current!.style.cursor = over ? 'pointer' : '';
      if (over && over.project >= 0) scene.current!.prefetch(over.project);
    });
  };

  const step = (by: number) => {
    stepped.current = by;
    navigateSoft('project', projects[(shown + by + projects.length) % projects.length].slug, true);
  };

  return (
    <section
      ref={root}
      className={`pj${index >= 0 ? ' is-open' : ''}${index >= 0 && arrived ? ' is-arrived' : ''}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerMove={onPointerMove}
    >
      <canvas ref={canvas} className="pj__canvas" />
      <span ref={cursor} className="pj__close" aria-hidden="true">
        <svg viewBox="-0.5 -0.5 10 10">
          <path d={CLOSE_ICON} />
        </svg>
      </span>
      <button type="button" className="pj__close-button" aria-label="Close the project" onClick={close}>
        <svg viewBox="-0.5 -0.5 10 10" aria-hidden="true">
          <path d={CLOSE_ICON} />
        </svg>
      </button>
      {/* there from the start, out of sight: its place tells the scene where the open picture fits */}
      <ProjectPanel
        ref={panel}
        project={projects[Math.max(0, shown)]}
        open={index >= 0 && arrived}
        onPrevious={() => step(-1)}
        onNext={() => step(1)}
      />
    </section>
  );
}
