'use client';

import type { ReactElement } from 'react';
import { CLIENT_COLORS, DEFAULT_CLIENT_COLOR } from '@tt/shared';

export interface ColorSwatchPickerProps {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  /** Accessible label for the radio group. */
  label: string;
}

export function ColorSwatchPicker({
  value,
  onChange,
  disabled = false,
  label,
}: ColorSwatchPickerProps): ReactElement {
  const options = [DEFAULT_CLIENT_COLOR, ...CLIENT_COLORS];
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          disabled={disabled}
          onClick={() => onChange(c)}
          style={{ backgroundColor: c }}
          className={`h-7 w-7 rounded-full ring-offset-2 disabled:opacity-50 ${
            value === c ? 'ring-2 ring-zinc-900 dark:ring-zinc-100' : ''
          }`}
        />
      ))}
    </div>
  );
}
