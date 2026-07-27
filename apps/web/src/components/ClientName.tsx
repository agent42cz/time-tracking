import type { CSSProperties, ReactElement } from 'react';
import { darkVariantOf } from '@tt/shared';

export interface ClientNameProps {
  name: string | null;
  color: string | null;
  /** Rendered when there is no client. Defaults to an em dash. */
  fallback?: string;
}

/**
 * A client's name, tinted with its colour (US-102).
 *
 * The stored colour is the light-theme hex; its dark counterpart comes from
 * `darkVariantOf`. Both are handed to CSS as custom properties and the
 * `.client-tint` rule picks one, because Tailwind's `dark:` variant cannot
 * reach an inline style and the hue is per-row dynamic.
 *
 * The neutral default has no dark counterpart, so `darkVariantOf` returns null
 * and the name renders untinted, inheriting the theme — which keeps every
 * client that predates this feature looking exactly as it did.
 */
export function ClientName({ name, color, fallback = '—' }: ClientNameProps): ReactElement {
  if (!name) return <span>{fallback}</span>;
  const dark = color ? darkVariantOf(color) : null;
  if (!color || !dark) return <span>{name}</span>;
  return (
    <span
      className="client-tint"
      style={{ '--tint-light': color, '--tint-dark': dark } as CSSProperties}
    >
      {name}
    </span>
  );
}
