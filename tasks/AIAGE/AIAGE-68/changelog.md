# AIAGE-68 — Local implementation

Added automatic dismissal when the action popup loses document focus or becomes
hidden. `popup-entry.tsx` installs the lifecycle handler before rendering, so it
works during loading and login as well as tracking. It is restricted to Chrome
popup views: regular extension tabs and the Vite preview are unaffected.

The handler waits for initial focus, defers blur checks by one task, and cancels
pending dismissal if focus returns. Native dropdowns, date pickers, and field
focus transfers remain usable. A Czech-labelled X provides manual dismissal;
the tracking header stays visible when scrolling. Its label reuses
`extension.closePopup` from the web's Czech message catalogue.

## Validation

- Regression checks: missing X failed before implementation; the real-focus
  outside-click test also failed with the original startup code restored, and
  passes with the automatic dismissal handler installed.
- Extension unit suite: 75 passed, including six lifecycle cases for focus loss,
  initial focus, refocus cancellation, retained document focus, visibility, and
  listener/timer cleanup.
- Extension Playwright suite: 16 passed, including eight US-30 dismissal cases.
  These exercise actual window closure, outside clicks, native controls, regular
  tab exclusion, and dismissal during pending API requests.
- Three real-focus browser scenarios also passed in headed Chromium under Xvfb.
- Extension production bundle: built by the Playwright server setup.
- Extension TypeScript, repository ESLint, changed-file Prettier checks, and
  `git diff --check`: passed.
- US trace: 109/109 active stories (100%).

The browser tests use script-opened Chromium windows (which do not auto-dismiss)
and existing API/storage fixtures. Focus emulation is disabled and the full
Chromium channel is used: its headless shell keeps pages independently focused.
This reproduces a retained window receiving actual focus loss. The exact native
Chrome trigger in the reporter's session remains unknown; the supplied logs
contain sync/network events, not focus events. An installed-action-popup probe
could not run because the test browser crashed on `chrome.action.openPopup()` in
this container. No deployment or extension release was made.

Changes are local on `fix/aiage-68-popup-close`; no commit has been created.
