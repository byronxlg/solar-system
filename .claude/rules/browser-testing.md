# Browser checks: no models, one server

MediaPipe in the browser uses a lot of RAM and GPU. Too many tabs or dev
servers with models loaded can take the whole machine down.

- Always test with `?nomodels` (or `VITE_NO_MODELS=1`). Drive gestures through
  `window.__kiosk.gesture(name)` and `window.__view.hands([...])` instead.
- Run at most one dev server at a time for checks, and stop it when done.
- Only Byron opens the full-model app, in his own browser.
