'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  DIRECT_ENTRY_DELAY,
  directEntryLayer,
  followPath,
  registerLayer,
  startLayers,
  type LayerId,
} from '@/lib/page-layers';
import { useScroll } from '@/lib/scroll';

/** Registers a page layer; `enter` replays its entrance when it slides in (or is the page on load). */
export function usePageLayer(id: LayerId, enter: (delay: number) => void) {
  const panel = useRef<HTMLDivElement>(null);
  const latest = useRef(enter);
  useEffect(() => {
    latest.current = enter;
  });
  useEffect(() => {
    if (!panel.current) return;
    return registerLayer(id, { panel: panel.current, enter: (delay) => latest.current(delay) });
  }, [id]);
  return panel;
}

/** Mounted once: keeps the layer stack in line with the URL. */
export function useLayerRouter() {
  const pathname = usePathname();
  const { lenis, setLoop, ready } = useScroll();
  const started = useRef(false);

  useEffect(() => {
    if (!lenis) return;
    startLayers({ lenis, setLoop, path: pathname });
    if (started.current) followPath(pathname);
    started.current = true;
  }, [lenis, setLoop, pathname]);

  useEffect(() => {
    if (ready) directEntryLayer()?.enter(DIRECT_ENTRY_DELAY);
  }, [ready]);
}
