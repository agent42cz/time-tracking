import { describe, expect, it } from 'vitest';
import { CLIENT_COLORS, DEFAULT_CLIENT_COLOR, isClientColor } from './colors.js';
import { ClientColorSchema } from './validators/index.js';

describe('client colours', () => {
  it('US-102: the palette holds 10 distinct lowercase hex colours', () => {
    expect(CLIENT_COLORS).toHaveLength(10);
    expect(new Set(CLIENT_COLORS).size).toBe(10);
    for (const c of CLIENT_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('US-102: the default grey is not a palette entry', () => {
    expect(CLIENT_COLORS).not.toContain(DEFAULT_CLIENT_COLOR);
    expect(DEFAULT_CLIENT_COLOR).toBe('#6b7280');
  });

  it('US-102: isClientColor accepts palette entries and the default, rejects anything else', () => {
    expect(isClientColor(CLIENT_COLORS[0]!)).toBe(true);
    expect(isClientColor(DEFAULT_CLIENT_COLOR)).toBe(true);
    expect(isClientColor('#123456')).toBe(false);
    expect(isClientColor('red')).toBe(false);
  });

  it('US-102: every palette entry satisfies ClientColorSchema', () => {
    for (const c of CLIENT_COLORS) expect(ClientColorSchema.safeParse(c).success).toBe(true);
  });
});
