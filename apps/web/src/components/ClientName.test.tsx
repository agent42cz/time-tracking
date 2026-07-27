// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CLIENT_COLORS, DEFAULT_CLIENT_COLOR } from '@tt/shared';
import { ClientName } from './ClientName';

// vitest.config.ts does not set `test.globals: true`, so testing-library's
// auto-cleanup (which detects a global `afterEach`) never registers — without
// this, each test's render leaks into the next test's jsdom document.
afterEach(cleanup);

describe('ClientName', () => {
  it('US-102: renders the name tinted with the client colour', () => {
    // The component never sets an inline `color` — that's the whole point of
    // the two-tone design (see globals.css): it hands the light/dark hexes to
    // CSS as custom properties and lets `.client-tint`/`.dark .client-tint`
    // pick one, because jsdom (this test) never loads that stylesheet and a
    // real browser only resolves `.dark` at render time. So the unit-testable
    // contract is "did it set the right custom properties + class", while the
    // Playwright spec (client-color.spec.ts) is what proves the final
    // resolved `color` in a real, styled browser.
    render(<ClientName name="Acme" color={CLIENT_COLORS[0]!.light} />);
    const el = screen.getByText('Acme');
    expect(el).toHaveClass('client-tint');
    expect(el.style.getPropertyValue('--tint-light')).toBe(CLIENT_COLORS[0]!.light);
    expect(el.style.getPropertyValue('--tint-dark')).toBe(CLIENT_COLORS[0]!.dark);
  });

  it('US-102: the neutral default sets no inline colour so the theme wins', () => {
    render(<ClientName name="Acme" color={DEFAULT_CLIENT_COLOR} />);
    const el = screen.getByText('Acme');
    expect(el).not.toHaveClass('client-tint');
    expect(el.style.color).toBe('');
  });

  it('US-102: a missing client renders the fallback with no colour', () => {
    render(<ClientName name={null} color={null} fallback="—" />);
    expect(screen.getByText('—').style.color).toBe('');
  });
});
