import { ArrowIcon } from '@/components/ui/icons';
import { RollText } from '@/components/ui/RollText';
import { cx } from '@/lib/css';

interface ButtonProps {
  variant: 'primary' | 'blue' | 'ghost';
  label: string;
  onClick: () => void;
  className?: string;
  arrow?: boolean;
  disabled?: boolean;
}

export function Button({ variant, label, onClick, className, arrow = false, disabled = false }: ButtonProps) {
  return (
    <button
      className={cx('sa-btn', `sa-btn--${variant}`, className)}
      type="button"
      disabled={disabled}
      data-roll-host=""
      onClick={onClick}
    >
      <RollText text={label} />
      {arrow && <ArrowIcon />}
    </button>
  );
}
