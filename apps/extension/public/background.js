// MV3 service worker. Polls /api/v1/timer at most every 30s, and switches
// the toolbar icon between idle and active depending on whether the user
// has any running timers. Works with the popup closed.
//
// Plain ES module — written in JS so it doesn't go through the Vite bundle
// (Vite would otherwise try to inline it as a popup chunk).

const POLL_ALARM = 'tt:poll';
const POLL_PERIOD_MIN = 0.5; // 30s

// Diagnostics (US-104): same ring-buffer shape as src/diag.ts, duplicated
// here on purpose. This file is plain JS in public/ specifically so Vite
// copies it verbatim instead of bundling it as a popup chunk (see header
// above) — it cannot import a TypeScript module, so the ~15-line appender
// is inlined rather than shared. Do not "fix" this by restructuring the
// build; that was considered and rejected.
const DIAG_KEY = 'tt:diag';
const DIAG_CAP = 300;
const SW_INSTANCE = crypto.randomUUID();

async function diag(event, data) {
  try {
    const out = await chrome.storage.local.get(DIAG_KEY);
    const rows = out[DIAG_KEY] ?? [];
    rows.push({
      ts: Date.now(),
      surface: 'sw',
      instance: SW_INSTANCE,
      event,
      ...(data ? { data } : {}),
    });
    await chrome.storage.local.set({
      [DIAG_KEY]: rows.length > DIAG_CAP ? rows.slice(rows.length - DIAG_CAP) : rows,
    });
  } catch {
    /* diagnostics are best-effort */
  }
}

const ICON_PATHS = {
  idle: {
    16: 'icons/icon-16-idle.png',
    32: 'icons/icon-32-idle.png',
    48: 'icons/icon-48-idle.png',
    128: 'icons/icon-128-idle.png',
  },
  active: {
    16: 'icons/icon-16-active.png',
    32: 'icons/icon-32-active.png',
    48: 'icons/icon-48-active.png',
    128: 'icons/icon-128-active.png',
  },
};

async function setIconState(state) {
  await chrome.action.setIcon({ path: ICON_PATHS[state] });
  await chrome.action.setTitle({
    title: state === 'active' ? 'Time Tracker — měření běží' : 'Time Tracker',
  });
}

const ICON_HINT_KEY = 'tt:icon-hint';

function normalizeApiBase(base) {
  return String(base ?? '')
    .trim()
    .replace(/\/+$/, '');
}

function applyRunningCount(running) {
  const n = typeof running === 'number' && running > 0 ? running : 0;
  void setIconState(n > 0 ? 'active' : 'idle');
  void chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
  if (n > 0) {
    void chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  }
}

async function loadSession() {
  const out = await chrome.storage.local.get(['tt:session']);
  return out['tt:session'] ?? null;
}

async function poll() {
  const session = await loadSession();
  if (!session?.token || !session?.apiBase) {
    applyRunningCount(0);
    return;
  }
  const apiBase = normalizeApiBase(session.apiBase);
  const url = `${apiBase}/api/v1/timer`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.token}` },
      credentials: 'omit',
      cache: 'no-store',
      // Never follow a redirect. An access proxy in front of the API answers
      // with a 302 to its own login host, which host_permissions does not
      // cover, so a redirect-following fetch dies as an unattributable
      // "Failed to fetch" (AIAGE-66). Mirrors isAccessRedirect in src/api.ts —
      // duplicated because this file cannot import TypeScript (see header).
      redirect: 'manual',
    });
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      // Reachable, but something in front of the app is intercepting the call.
      // Keep the last icon state: the timer data we have is stale, not wrong.
      void diag('poll:blocked', { url, status: res.status });
      return;
    }
    if (res.status === 401) {
      // Token rejected — clear it so the popup falls back to login. The diag
      // buffer goes with it: it holds entry ids from the session that just
      // ended (mirrors setStoredSession in src/api.ts).
      void diag('poll:401');
      await chrome.storage.local.remove(['tt:session', DIAG_KEY, ICON_HINT_KEY]);
      applyRunningCount(0);
      return;
    }
    if (!res.ok) {
      // Don't change state on transient errors; keep last shown.
      void diag('poll:http', { status: res.status });
      return;
    }
    const data = await res.json();
    const running = Array.isArray(data?.running) ? data.running.length : 0;
    void diag('poll:result', { running });
    applyRunningCount(running);
  } catch (err) {
    // Network down — leave the icon as-is rather than flapping to idle.
    // The popup writes tt:icon-hint on refresh so the icon can still update
    // without this fetch succeeding (AIAGE-63).
    void diag('poll:error', {
      message: err instanceof Error ? err.message : String(err),
      url,
    });
  }
}

function ensureAlarm() {
  void chrome.alarms.create(POLL_ALARM, {
    periodInMinutes: POLL_PERIOD_MIN,
    delayInMinutes: 0,
  });
}

// Re-create the alarm on every worker start. onInstalled/onStartup do not
// fire when Chrome kills and restarts an idle MV3 worker, and some Chrome
// profiles drop persisted alarms after an update (AIAGE-63).
ensureAlarm();
void poll();

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  void poll();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  void poll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void poll();
});

// Refresh immediately when the popup writes session/timer state.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // Writing a diag record is itself a storage change — logging every change
  // unconditionally would create an infinite feedback loop that fills the
  // buffer with noise. Skip only when tt:diag is the SOLE changed key (our
  // own append); if it changed alongside another key, that other key's
  // change is real and still worth logging (US-104).
  const changedKeys = Object.keys(changes);
  const onlyDiagChanged = changedKeys.length === 1 && changedKeys[0] === DIAG_KEY;
  if (!onlyDiagChanged) {
    void diag('storage:changed', { keys: changedKeys });
  }
  if (changes[ICON_HINT_KEY] && typeof changes[ICON_HINT_KEY].newValue === 'number') {
    applyRunningCount(changes[ICON_HINT_KEY].newValue);
  }
  if (changes['tt:session'] || changes[ICON_HINT_KEY]) {
    void poll();
  }
});

// Allow the popup to nudge an immediate refresh after a mutation.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'tt:refresh') {
    void diag('sw:nudge');
    poll().then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  return false;
});

// External: web bridge at /extension/connect hands us a freshly-minted
// token after the user authenticates on the website. Sender origins are
// gated by the manifest's externally_connectable.matches.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (
    msg?.type === 'tt:auth' &&
    typeof msg.token === 'string' &&
    typeof msg.apiBase === 'string' &&
    typeof msg.expiresAt === 'string'
  ) {
    chrome.storage.local
      .set({
        'tt:session': {
          token: msg.token,
          expiresAt: msg.expiresAt,
          apiBase: normalizeApiBase(msg.apiBase),
        },
      })
      .then(() => poll())
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async response
  }
  sendResponse({ ok: false, error: 'unsupported_message' });
  return false;
});
