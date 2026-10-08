'use client';

import { useId, type ReactNode } from 'react';
import { cx } from '@/lib/css';

/** A row that opens to show its content (height animated through grid rows, no measuring). */
export function Accordion({
  title,
  open,
  onToggle,
  className,
  children,
}: {
  title: ReactNode;
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={cx('acc', open && 'is-open', className)}>
      <button type="button" className="acc__head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span>{title}</span>
        <span className="acc__icon" aria-hidden="true" />
      </button>
      <div className="acc__body" id={id}>
        <div className="acc__inner">{children}</div>
      </div>
    </div>
  );
}
