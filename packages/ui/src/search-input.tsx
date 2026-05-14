'use client';

import { useRef, type KeyboardEvent, type ReactElement } from 'react';
import { cn } from './cn.js';

const wrapper = 'relative w-full';

const inputBase =
  'block w-full rounded-md border border-zinc-200 bg-white pl-9 pr-9 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 ' +
  'focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 ' +
  'disabled:bg-zinc-50 disabled:text-zinc-500 disabled:cursor-not-allowed ' +
  'dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 ' +
  'dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10 ' +
  '[&::-webkit-search-cancel-button]:hidden';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  clearAriaLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  ariaLabel,
  clearAriaLabel,
  placeholder,
  autoFocus,
  className,
}: SearchInputProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape' && value.length > 0) {
      e.preventDefault();
      onChange('');
    }
  }

  function handleClear(): void {
    onChange('');
    inputRef.current?.focus();
  }

  return (
    <div className={cn(wrapper, className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-500"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="9" cy="9" r="6" />
        <line x1="14" y1="14" x2="18" y2="18" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        role="searchbox"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className={inputBase}
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label={clearAriaLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <line x1="3" y1="3" x2="13" y2="13" />
            <line x1="13" y1="3" x2="3" y2="13" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
