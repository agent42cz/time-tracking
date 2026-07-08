import { useEffect } from 'react';

/**
 * Lock `<body>` scrolling for as long as the caller is mounted.
 *
 * The popup's root is document-tall, so an open sheet (`fixed inset-0`) covers
 * the viewport while the history list behind it is still scrollable. Locking
 * the body stops the list sliding around underneath.
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
