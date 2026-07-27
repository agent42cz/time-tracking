import { describe, expect, it } from 'vitest';
import {
  CLIENT_COLORS,
  CLIENT_COLOR_VALUES,
  DEFAULT_CLIENT_COLOR,
  darkVariantOf,
  isClientColor,
} from './colors.js';
import { ClientColorSchema } from './validators/index.js';

/** WCAG 2.1 relative luminance / contrast ratio. */
function contrast(a: string, b: string): number {
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = (h: string): number =>
    0.2126 * lin(parseInt(h.slice(1, 3), 16)) +
    0.7152 * lin(parseInt(h.slice(3, 5), 16)) +
    0.0722 * lin(parseInt(h.slice(5, 7), 16));
  const [l1, l2] = [lum(a), lum(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// The app's actual surfaces: body and card, per theme (apps/web/src/app/layout.tsx:48
// and the globals.css pairing table).
const LIGHT_BACKGROUNDS = ['#fafafa', '#ffffff'];
const DARK_BACKGROUNDS = ['#18181b', '#27272a'];

describe('client colours', () => {
  it('US-102: the palette holds 10 distinct light/dark pairs in lowercase hex', () => {
    expect(CLIENT_COLORS).toHaveLength(10);
    expect(new Set(CLIENT_COLOR_VALUES).size).toBe(10);
    expect(new Set(CLIENT_COLORS.map((c) => c.dark)).size).toBe(10);
    for (const c of CLIENT_COLORS) {
      expect(c.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.dark).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('US-102: every palette colour is legible as text on its own theme backgrounds', () => {
    for (const c of CLIENT_COLORS) {
      for (const bg of LIGHT_BACKGROUNDS) {
        expect(contrast(c.light, bg), `${c.light} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const bg of DARK_BACKGROUNDS) {
        expect(contrast(c.dark, bg), `${c.dark} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('US-102: the default grey is not a palette entry', () => {
    expect(CLIENT_COLOR_VALUES).not.toContain(DEFAULT_CLIENT_COLOR);
    expect(DEFAULT_CLIENT_COLOR).toBe('#6b7280');
  });

  it('US-102: isClientColor accepts stored palette values and the default, rejects anything else', () => {
    expect(isClientColor(CLIENT_COLOR_VALUES[0]!)).toBe(true);
    expect(isClientColor(DEFAULT_CLIENT_COLOR)).toBe(true);
    expect(isClientColor('#123456')).toBe(false);
    expect(isClientColor('red')).toBe(false);
    // A dark-variant hex is NOT a storable value — only light hexes are canonical.
    expect(isClientColor(CLIENT_COLORS[0]!.dark)).toBe(false);
  });

  it('US-102: darkVariantOf maps a stored colour to its counterpart, and the default to null', () => {
    expect(darkVariantOf(CLIENT_COLORS[3]!.light)).toBe(CLIENT_COLORS[3]!.dark);
    expect(darkVariantOf(DEFAULT_CLIENT_COLOR)).toBeNull();
    expect(darkVariantOf('#123456')).toBeNull();
  });

  it('US-102: every stored palette value satisfies ClientColorSchema', () => {
    for (const v of CLIENT_COLOR_VALUES) expect(ClientColorSchema.safeParse(v).success).toBe(true);
  });
});
