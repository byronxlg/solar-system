// Dev flags. NO_MODELS skips the MediaPipe models so the page is up in a
// second: open the page with ?nomodels, or start the dev server with
// VITE_NO_MODELS=1. The kiosk reports "ready" with stubs that return no
// hands and no body, so the window.__view / __kiosk dev hooks still drive
// everything.
//
// The hand stub reads window.__fake: a list of hands to pretend the camera
// sees, each { gesture, score, x, y, size, grab, hand }, so a headless test
// can walk the real kiosk pipeline (landmarks, Grab detection, hand size,
// overlays). x, y is the palm centre and size the palm length, all as
// fractions of the video frame; grab puts the index tip on the thumb tip.
// The body stub reads window.__fakeBody: one body as { x, y, size, left,
// right } where x, y is the middle of the shoulders, size the shoulder
// width, and left / right the wrists as { x, y, z } (the person's left is on
// the right of the raw frame, like a real camera). Null for nobody.
export const NO_MODELS =
  new URLSearchParams(window.location.search).has("nomodels") || import.meta.env.VITE_NO_MODELS === "1";

if (NO_MODELS) console.info("[dev] nomodels: skipping the gesture and body models");

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

// 33 body landmarks for one person facing the camera: shoulders either
// side of (x, y), hips below, elbows halfway to the wrists. Everything else
// sits on the chest with no visibility, so a consumer that checks
// visibility ignores it.
export function fakeBody({ x, y, size = 0.3, left = null, right = null }) {
  const half = size / 2;
  const pt = (px, py, z = 0, visibility = 1) => ({ x: px, y: py, z, visibility });
  const lm = Array.from({ length: 33 }, () => pt(x, y + size * 0.6, 0, 0));
  lm[0] = pt(x, y - size * 0.55); // nose
  lm[11] = pt(x + half, y); // left shoulder (image right)
  lm[12] = pt(x - half, y); // right shoulder
  lm[23] = pt(x + half * 0.7, y + size * 1.5); // hips
  lm[24] = pt(x - half * 0.7, y + size * 1.5);
  const lw = left || { x: x + size * 0.6, y: y + size * 1.2, z: 0 };
  const rw = right || { x: x - size * 0.6, y: y + size * 1.2, z: 0 };
  lm[15] = pt(lw.x, lw.y, lw.z || 0);
  lm[16] = pt(rw.x, rw.y, rw.z || 0);
  lm[13] = pt((lm[11].x + lw.x) / 2, (lm[11].y + lw.y) / 2, (lw.z || 0) / 2);
  lm[14] = pt((lm[12].x + rw.x) / 2, (lm[12].y + rw.y) / 2, (rw.z || 0) / 2);
  return lm;
}

// What the pose task returns: nobody, or window.__fakeBody. The world
// landmarks (metres about the hips) come from the frame with the shoulder
// width as 0.4 m and a 4:3 frame, which is what the fake camera gives.
export const STUB_POSE_LANDMARKER = {
  detectForVideo() {
    const body = window.__fakeBody;
    if (!body) return { landmarks: [], worldLandmarks: [] };
    const lm = fakeBody(body);
    const k = 0.4 / (body.size || 0.3);
    const world = lm.map((p) => ({ x: (p.x - body.x) * k, y: (p.y - body.y) * 0.75 * k, z: p.z * k, visibility: p.visibility }));
    return { landmarks: [lm], worldLandmarks: [world] };
  },
  close() {},
};
