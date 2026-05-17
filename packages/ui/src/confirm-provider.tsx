'use client';

import type { ReactElement, ReactNode } from 'react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmModal } from './confirm-modal.js';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  content?: ReactNode;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingRequest {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }): ReactElement {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const pendingRef = useRef<PendingRequest | null>(null);
  pendingRef.current = pending;

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      const previous = pendingRef.current;
      if (previous) {
        previous.resolve(false);
      }
      const next: PendingRequest = { options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const onCancel = useCallback(() => settle(false), [settle]);
  const onConfirm = useCallback(() => settle(true), [settle]);

  const opts = pending?.options;
  const tone = opts?.tone ?? 'danger';
  const confirmLabel = opts?.confirmLabel ?? (tone === 'danger' ? 'Smazat' : 'Potvrdit');

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        open={pending !== null}
        title={opts?.title ?? ''}
        description={opts?.description}
        confirmLabel={confirmLabel}
        cancelLabel={opts?.cancelLabel ?? 'Zrušit'}
        tone={tone}
        onCancel={onCancel}
        onConfirm={onConfirm}
      >
        {opts?.content}
      </ConfirmModal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  return ctx;
}
