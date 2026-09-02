// Dev flags. NO_MODELS skips the MediaPipe gesture model so the page is up in
// a second: open the page with ?nomodels, or start the dev server with
// VITE_NO_MODELS=1. The kiosk reports "ready" with a stub that returns no
// hands, so the window.__view / __kiosk dev hooks still drive everything.
export const NO_MODELS =
  new URLSearchParams(window.location.search).has("nomodels") || import.meta.env.VITE_NO_MODELS === "1";

if (NO_MODELS) console.info("[dev] nomodels: skipping the gesture model");

// What the MediaPipe task returns when nothing is in frame.
export const STUB_GESTURE_RECOGNIZER = { recognizeForVideo: () => ({ landmarks: [], gestures: [], handedness: [] }), close() {} };
