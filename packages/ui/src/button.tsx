import type { ButtonHTMLAttributes, ReactElement } from 'react';
import { cn } from './cn.js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-zinc-900 text-white hover:bg-zinc-800 active:bg-zinc-950 focus-visible:ring-zinc-900 disabled:bg-zinc-300 disabled:text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:active:bg-zinc-50 dark:focus-visible:ring-zinc-100 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400',
  secondary:
    'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50 active:bg-zinc-100 focus-visible:ring-zinc-300 disabled:text-zinc-400 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700 dark:active:bg-zinc-700 dark:focus-visible:ring-zinc-600 dark:disabled:text-zinc-500',
  ghost:
    'bg-transparent text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200 focus-visible:ring-zinc-300 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:active:bg-zinc-700 dark:focus-visible:ring-zinc-600',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-600 disabled:bg-red-300 dark:bg-red-500 dark:hover:bg-red-600 dark:active:bg-red-700 dark:focus-visible:ring-red-500 dark:disabled:bg-red-900',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-md',
  md: 'h-10 px-4 text-sm rounded-md',
  lg: 'h-12 px-6 text-base rounded-lg font-semibold',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
