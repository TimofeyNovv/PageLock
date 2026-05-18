# PageLock

PageLock is a small browser extension for locking selected websites with a separate password for each site.

## Run in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on`.
3. Select `manifest.json` from this folder.
4. Open any website and click the PageLock extension icon.

Temporary Firefox add-ons are removed after browser restart. Later, the extension can be packaged for GitHub releases.

## Run in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable developer mode.
3. Click `Load unpacked`.
4. Select this project folder.

## Project Structure

```text
PageLock/
  manifest.json
  background/
    service-worker.js
  content/
    content.js
    lock-screen.css
  icons/
    pagelock.svg
  popup/
    popup.html
    popup.css
    popup.js
  shared/
    browser-api.js
    crypto.js
    site.js
```
