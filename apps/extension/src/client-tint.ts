import type { CSSProperties } from 'react';
import { darkVariantOf } from '@tt/shared/colors';

/** Same two-variable trick as the web app's ClientName — see index.css. */
export function clientTint(color: string | null): CSSProperties | undefined {
  const dark = color ? darkVariantOf(color) : null;
  if (!color || !dark) return undefined;
  return { '--tint-light': color, '--tint-dark': dark } as CSSProperties;
}
