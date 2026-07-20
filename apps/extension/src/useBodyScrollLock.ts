import { useEffect } from 'react';

/**
 * Lock `<body>` scrolling for as long as the caller is mounted.
 *
 * The popup's root is document-tall, so an open sheet (`fixed inset-0`) covers
 * the viewport while the history list behind it is still scrollable. Locking
 * the body stops the list sliding around underneath.
 *
 * Caveat: this assumes a single lock-holder, or strictly nested (LIFO)
 * holders — it snapshots `overflow` on mount and restores that snapshot on
 * unmount. If two holders are mounted at once and the first one to mount is
 * not the last one to unmount, the earlier holder's cleanup restores the
 * pre-lock value while the later holder still needs the body locked.
 */
export function useBodyScrollLock(): void {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}
