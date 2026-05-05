// MV3 service worker. Polls /api/v1/timer at most every 30s, and switches
// the toolbar icon between idle and active depending on whether the user
// has any running timers. Works with the popup closed.
//
// Plain ES module — written in JS so it doesn't go through the Vite bundle
// (Vite would otherwise try to inline it as a popup chunk).

const POLL_ALARM = 'tt:poll';
const POLL_PERIOD_MIN = 0.5; // 30s

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

async function loadSession() {
  const out = await chrome.storage.local.get(['tt:session']);
  return out['tt:session'] ?? null;
}

async function poll() {
  const session = await loadSession();
  if (!session?.token || !session?.apiBase) {
    await setIconState('idle');
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  try {
    const res = await fetch(`${session.apiBase}/api/v1/timer`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (res.status === 401) {
      // Token rejected — clear it so the popup falls back to login.
      await chrome.storage.local.remove(['tt:session']);
      await setIconState('idle');
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    if (!res.ok) {
      // Don't change state on transient errors; keep last shown.
      return;
    }
    const data = await res.json();
    const running = Array.isArray(data?.running) ? data.running.length : 0;
    await setIconState(running > 0 ? 'active' : 'idle');
    await chrome.action.setBadgeText({
      text: running > 0 ? String(running) : '',
    });
    if (running > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    }
  } catch {
    // Network down — leave the icon as-is rather than flapping to idle.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(POLL_ALARM, {
    periodInMinutes: POLL_PERIOD_MIN,
    delayInMinutes: 0,
  });
  void poll();
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(POLL_ALARM, {
    periodInMinutes: POLL_PERIOD_MIN,
    delayInMinutes: 0,
  });
  void poll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void poll();
});

// Refresh immediately when the popup writes session/timer state.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes['tt:session'] || changes['tt:icon-hint']) {
    void poll();
  }
});

// Allow the popup to nudge an immediate refresh after a mutation.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'tt:refresh') {
    poll().then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  return false;
});
