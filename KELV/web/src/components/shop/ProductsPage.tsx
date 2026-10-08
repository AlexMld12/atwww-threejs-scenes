'use client';

import { useState } from 'react';
import { Reveal } from '@/components/ui/Reveal';
import { cx } from '@/lib/css';
import { CATEGORIES, GOALS, GROUPS, type CategoryId } from '@/shop/catalog';
import { ComingSoonCard, ProductCard } from './ProductCard';

/** /products: the category titles filter the groups; the goals are toggles only (no filtering yet). */
export function ProductsPage() {
  const [category, setCategory] = useState<CategoryId>('all');
  const [goals, setGoals] = useState<ReadonlySet<string>>(() => new Set(['Glow']));

  const toggle = (goal: string) =>
    setGoals((current) => {
      const next = new Set(current);
      if (next.has(goal)) next.delete(goal);
      else next.add(goal);
      return next;
    });

  const groups = GROUPS.filter((group) => category === 'all' || group.id === category);

  return (
    <section className="products">
      <Reveal as="div" className="tabs" fx="blur">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={cx('tab', c.id === category && 'is-active')}
            aria-pressed={c.id === category}
            onClick={() => setCategory(c.id)}
          >
            <CategoryLabel label={c.label} />
          </button>
        ))}
      </Reveal>

      <Reveal as="div" className="goals" delay={0.1}>
        <p className="goals__label">
          My goal is <span className="dim">[Combine goals as needed]:</span>
        </p>
        <div className="goals__list">
          {GOALS.map((goal) => (
            <button
              key={goal}
              type="button"
              className={cx('goal mono', goals.has(goal) && 'is-on')}
              aria-pressed={goals.has(goal)}
              onClick={() => toggle(goal)}
            >
              {goal}
            </button>
          ))}
        </div>
      </Reveal>

      <div className="groups" key={category}>
        {groups.map((group) => {
          const count = group.products?.length ?? group.soon?.length ?? 0;
          return (
            <div key={group.id} className="group">
              <Reveal className="group__label">
                {group.label} <span className="dim">[{count}]</span>
              </Reveal>
              <div className="grid">
                {group.products?.map((product, i) => (
                  <ProductCard key={product.slug} product={product} index={i} />
                ))}
                {group.soon?.map((item, i) => (
                  <ComingSoonCard key={i} item={item} index={i} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** "KELV Skincare" carries the orange degree of the logo. */
export function CategoryLabel({ label }: { label: string }) {
  if (!label.startsWith('KELV ')) return <>{label}</>;
  return (
    <>
      KELV
      <span className="tab__deg" aria-hidden="true" /> {label.slice(5)}
    </>
  );
}
