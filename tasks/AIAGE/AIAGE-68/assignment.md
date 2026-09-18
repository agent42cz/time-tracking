# AIAGE-68 — Extension popup dismissal

The tracker popup can remain over the webpage after a click outside it in Chrome.
Dismiss the popup automatically when focus leaves it, even if Chrome's native
dismissal fails, and provide an explicit X as a manual escape.

## Acceptance criteria

- An accessible Czech-labelled X closes the popup window.
- A popup that loses document focus or becomes hidden closes automatically.
- Initial focus acquisition, transfers between fields, and native dropdowns do
  not close it; popup.html opened as a normal tab remains open on focus loss.
- The button is available while loading, on the login screen, and while tracking.
- It stays reachable when the history is scrolled.
- Closing does not stop timers, log out, or change the offline queue.

The existing manifest uses Chrome's native action popup. The attached network/sync
diagnostics do not establish why that browser behavior failed in the reporter's
session. Add a local lifecycle guard without changing API, database, extension
permissions, or timer behavior.
