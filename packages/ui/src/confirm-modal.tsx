'use client';

import type { ReactElement, ReactNode } from 'react';
import { useEffect } from 'react';
import { Button } from './button.js';
import { cn } from './cn.js';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Potvrdit',
  cancelLabel = 'Zrušit',
  tone = 'default',
  loading,
  children,
  onConfirm,
  onCancel,
}: ConfirmModalProps): ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4 dark:bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={cn(
          'w-full max-w-md overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900',
        )}
      >
        <div className="px-5 py-4">
          <h2
            id="confirm-modal-title"
            className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            {title}
          </h2>
          {description ? (
            <div className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{description}</div>
          ) : null}
          {children ? (
            <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{children}</div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/40 px-5 py-3 dark:border-zinc-800/60 dark:bg-zinc-950/40">
          <Button
            autoFocus
            type="button"
            size="sm"
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
