// Dev flags. NO_MODELS skips the MediaPipe gesture model so the page is up in
// a second: open the page with ?nomodels, or start the dev server with
// VITE_NO_MODELS=1. The kiosk reports "ready" with a stub that returns no
// hands, so the window.__view / __kiosk dev hooks still drive everything.
//
// The stub also reads window.__fake: a list of hands to pretend the camera
// sees, each { gesture, score, x, y, size, grab, hand }, so a headless test
// can walk the real kiosk pipeline (landmarks, Grab detection, hand size,
// overlays). x, y is the palm centre and size the palm length, all as
// fractions of the video frame; grab puts the index tip on the thumb tip.
export const NO_MODELS =
  new URLSearchParams(window.location.search).has("nomodels") || import.meta.env.VITE_NO_MODELS === "1";

if (NO_MODELS) console.info("[dev] nomodels: skipping the gesture model");

// 21 landmarks for a flat, upright hand: wrist below the palm centre, four
// fingers fanned above it, thumb out to the side.
export function fakeLandmarks({ x, y, size = 0.2, grab = false }) {
  const s = size;
  const pt = (dx, dy) => ({ x: x + dx * s, y: y + dy * s, z: 0 });
  const lm = new Array(21);
  lm[0] = pt(0, 0.55); // wrist
  lm[1] = pt(-0.25, 0.45);
  lm[2] = pt(-0.45, 0.3);
  lm[3] = pt(-0.7, 0.05);
  lm[4] = pt(-0.8, -0.1); // thumb tip
  const fingers = [-0.3, -0.1, 0.1, 0.3]; // index, middle, ring, pinky
  fingers.forEach((fx, i) => {
    const base = 5 + i * 4;
    lm[base] = pt(fx, 0); // knuckle (5, 9, 13, 17)
    lm[base + 1] = pt(fx, -0.3);
    lm[base + 2] = pt(fx, -0.55);
    lm[base + 3] = pt(fx, -0.8); // tip (8, 12, 16, 20)
  });
  if (grab) lm[8] = { ...lm[4] };
  return lm;
}

// What the MediaPipe task returns: nothing in frame, or window.__fake.
export const STUB_GESTURE_RECOGNIZER = {
  recognizeForVideo() {
    const fake = window.__fake || [];
    return {
      landmarks: fake.map(fakeLandmarks),
      gestures: fake.map((h) => [{ categoryName: h.gesture || "None", score: h.score ?? 0.9 }]),
      handedness: fake.map((h, i) => [{ categoryName: h.hand || (i === 0 ? "Right" : "Left") }]),
    };
  },
  close() {},
};
