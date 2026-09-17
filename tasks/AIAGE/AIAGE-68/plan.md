# Implementation plan

1. Reproduce retained-window behavior with real Chrome focus changes, using a
   script-opened popup whose native auto-dismissal is absent. Disable Playwright's
   focus emulation and use full Chromium, since its headless shell keeps pages
   independently focused.
2. Install lifecycle listeners before React mounts, only for Chrome views of type
   `popup`. Track initial focus, defer a blur check until the next task, cancel on
   refocus, and close only when document focus is lost. Also close on hidden state.
3. Verify focus races and cleanup with fake timers, and exercise outside clicks,
   internal controls, native dropdowns, and regular-tab exclusion in Playwright.
4. Keep the shared X button available on loading, login, and tracking views, with
   the sticky tracking header and a label from the Czech message catalogue.
5. Run the extension unit and browser suites, typecheck, lint, and US trace check.

Browser references:

- [Chrome popup lifecycle](https://developer.chrome.com/docs/extensions/develop/ui/add-popup)
- [Programmatic popup dismissal](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups)
- [Chromium native popup close conditions](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/ui/views/extensions/extension_popup.cc)
