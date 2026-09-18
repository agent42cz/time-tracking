import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPopupDismissal } from './popup-lifecycle.js';

function popupFixture(initialFocus = true) {
  let focused = initialFocus;
  const document = Object.assign(new EventTarget(), {
    hasFocus: () => focused,
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const popup = Object.assign(new EventTarget(), { document, close: vi.fn() });
  const dispose = installPopupDismissal(popup);
  return {
    popup,
    document,
    dispose,
    setFocus(value: boolean) {
      focused = value;
      popup.dispatchEvent(new Event(value ? 'focus' : 'blur'));
    },
  };
}

describe('popup focus lifecycle (AIAGE-68)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('US-30: closes after focus leaves a previously focused popup', () => {
    const { popup, setFocus } = popupFixture();
    setFocus(false);
    expect(popup.close).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it('US-30: does not close a popup before Chrome has given it initial focus', () => {
    const { popup, setFocus } = popupFixture(false);
    setFocus(false);
    vi.runAllTimers();
    expect(popup.close).not.toHaveBeenCalled();
    setFocus(true);
    setFocus(false);
    vi.runAllTimers();
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it('US-30: cancels dismissal if focus returns before the deferred check', () => {
    const { popup, setFocus } = popupFixture();
    setFocus(false);
    setFocus(true);
    vi.runAllTimers();
    expect(popup.close).not.toHaveBeenCalled();
  });

  it('US-30: keeps a popup open when a blur event did not remove document focus', () => {
    const { popup } = popupFixture();
    popup.dispatchEvent(new Event('blur'));
    vi.runAllTimers();
    expect(popup.close).not.toHaveBeenCalled();
  });

  it('US-30: closes when a shown popup becomes hidden without a blur event', () => {
    const { popup, document } = popupFixture();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(popup.close).not.toHaveBeenCalled();
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it('US-30: cleanup cancels pending dismissal and detaches listeners', () => {
    const { popup, document, setFocus, dispose } = popupFixture();
    setFocus(false);
    dispose();
    vi.runAllTimers();
    setFocus(true);
    setFocus(false);
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.runAllTimers();
    expect(popup.close).not.toHaveBeenCalled();
  });
});
