// Apply the cached theme before React mounts to avoid FOUC.
(function () {
  try {
    var t = localStorage.getItem('tt:theme') || 'system';
    var dark =
      t === 'dark' ||
      (t === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch {
    // intentionally empty — theme is best-effort
  }
})();
