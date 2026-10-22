'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FINISHES, firstFinish, paletteStatement, type Page } from './content';
import { heroSettled } from './settle';
import { Statement } from './Statement';

type Scene = Awaited<ReturnType<typeof import('@/scene/showcase').createShowcaseScene>>;

// Behaviour of pedestal.com's showcase (their product-showcase, measured): the product stays on the screen (sticky,
// the screen's height, right under the text) while the section passes, turning with the scroll while it is pinned; a colour paints the product and the section's ground (0.3 s ease-out), its
// button grows (0.3 s). Figma: the ground is the colour at 60 % over the paper.
export function ProductShowcase({ page }: { page: Page }) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const [finish, setFinish] = useState(() => firstFinish(page));
  const [ready, setReady] = useState(false);
  const colour = FINISHES.find((f) => f.id === finish)!.hex;

  useEffect(() => {
    let cancelled = false;
    // the turn runs while the stage is pinned: from its top at the screen's top to the block's foot at the screen's
    const turn = () => {
      const block = root.current!.getBoundingClientRect();
      const stage = stageRef.current!;
      // where the stage starts: under the text (a sticky's own offsetTop follows it while pinned)
      const text = stage.previousElementSibling as HTMLElement;
      const start = text.offsetTop + text.offsetHeight;
      const progress = (-block.top - start) / (block.height - start - stage.offsetHeight);
      scene.current?.setTurn(Math.min(1, Math.max(0, progress)));
    };
    heroSettled()
      .then(() => import('@/scene/showcase'))
      // gone while it waited (a remount): nothing built
      .then(({ createShowcaseScene }) =>
        cancelled ? null : createShowcaseScene(canvas.current!, { product: page.id, colour }),
      )
      .then((created) => {
        if (!created) return;
        // dropped before use (a remount): the canvas and its context stay for the next scene
        if (cancelled) return created.dispose(false);
        scene.current = created;
        turn();
        setReady(true);
      })
      .catch((error) => console.error(error));
    window.addEventListener('scroll', turn, { passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener('scroll', turn);
      scene.current?.dispose();
      scene.current = null;
    };
    // the scene is built once per page; the colour changes go through setColour
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  useEffect(() => scene.current?.setColour(colour), [colour]);

  return (
    <section ref={root} className={`sc${ready ? ' is-ready' : ''}`} style={{ '--swatch': colour } as CSSProperties}>
      <Statement className="sc__statement" text={paletteStatement(page)} />
      <div ref={stageRef} className="sc__stage">
        <canvas ref={canvas} className="sc__canvas" />
        <div className="sc__swatches" role="radiogroup" aria-label="Colour">
          {FINISHES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={f.id === finish}
              aria-label={f.name}
              className={`sc__swatch${f.id === finish ? ' is-on' : ''}`}
              style={{ '--colour': f.hex } as CSSProperties}
              onClick={() => setFinish(f.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
