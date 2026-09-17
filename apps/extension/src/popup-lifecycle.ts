interface PopupWindow extends EventTarget {
  document: EventTarget & Pick<Document, 'hasFocus' | 'visibilityState'>;
  close(): void;
}

/**
 * Chrome normally dismisses action popups itself. If that native dismissal is
 * suppressed (e.g. while inspecting the popup), close on genuine focus loss.
 * Install before rendering so this also works during loading and login.
 */
export function installPopupDismissal(popup: PopupWindow): () => void {
  let wasFocused = popup.document.hasFocus();
  let pendingClose: ReturnType<typeof setTimeout> | undefined;

  function cancelPendingClose(): void {
    clearTimeout(pendingClose);
    pendingClose = undefined;
  }

  function onFocus(): void {
    wasFocused = true;
    cancelPendingClose();
  }

  function onBlur(): void {
    if (!wasFocused) return;
    cancelPendingClose();
    // Let focus settle before closing; an element losing focus or a brief
    // transfer that leaves the document focused must not dismiss the popup.
    pendingClose = setTimeout(() => {
      pendingClose = undefined;
      if (!popup.document.hasFocus()) popup.close();
    }, 0);
  }

  function onVisibilityChange(): void {
    if (wasFocused && popup.document.visibilityState === 'hidden') {
      cancelPendingClose();
      popup.close();
    }
  }

  function dispose(): void {
    cancelPendingClose();
    popup.removeEventListener('focus', onFocus);
    popup.removeEventListener('blur', onBlur);
    popup.removeEventListener('pagehide', dispose);
    popup.document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  // Do not capture element blur events: tabbing between controls stays inside.
  popup.addEventListener('focus', onFocus);
  popup.addEventListener('blur', onBlur);
  popup.addEventListener('pagehide', dispose, { once: true });
  popup.document.addEventListener('visibilitychange', onVisibilityChange);
  return dispose;
}
