import { useCallback, useRef } from "react";
import { minScore } from "./Kiosk.jsx";
import { pxPerUnit } from "./solar.js";
import { MIN_SCALE, MAX_SCALE } from "./useCamera.js";

// Turns per-frame hand info from the kiosk into camera movement.
//   one hand grabbing (index touching thumb) and moving -> pan (the sky follows the hand as seen on screen)
//   two Pointing_Up hands                      -> zoom by the distance between the two index fingertips (pinch)
const PAN_GAIN = 2.2; // screen widths of travel per normalised hand unit
const PAN_GESTURES = ["Grab"]; // synthesised by the Kiosk from landmarks: index touching thumb

// One Euro filter (Casiez, Roussel, Vogel 2012): heavy smoothing while the
// hand is still or slow, which removes landmark jitter, and light smoothing
// while it moves fast, so there is no visible lag. Units: normalised frame
// coordinates, seconds.
const MIN_CUTOFF = 1.2; // Hz. Lower = steadier when still
const BETA = 4; // how fast smoothing relaxes as speed rises
const D_CUTOFF = 1;
const smoothing = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export function makeOneEuro() {
  let x = null;
  let dx = 0;
  let t = null;
  return (value, now) => {
    if (x === null) {
      x = value;
      t = now;
      return value;
    }
    const dt = Math.max(1e-3, (now - t) / 1000);
    t = now;
    dx += smoothing(D_CUTOFF, dt) * ((value - x) / dt - dx);
    x += smoothing(MIN_CUTOFF + BETA * Math.abs(dx), dt) * (value - x);
    return x;
  };
}

// camera: from useCamera. Pans and zooms write to camera.goalRef and release
// any focused body, so the view stays where the hand left it.
export function useViewGestures(camera) {
  const panRef = useRef(null); // { fx, fy, x, y }: filters and last smoothed position while panning
  const zoomRef = useRef(null); // { d0, scale0, fd } while zooming

  const clear = useCallback(() => {
    panRef.current = null;
    zoomRef.current = null;
  }, []);

  // hands: [{ gesture, score, x, y, tipX, tipY }] with positions normalised to the
  // video frame; x, y is the palm, tipX, tipY the index fingertip (defaults to the palm).
  // size: { width, height } of the sky container, used to scale pan distance.
  // now: timestamp in ms, for the filters.
  const handleHands = useCallback((hands, size, now = performance.now()) => {
    const g = camera.goalRef.current;
    const fingers = hands.filter((h) => h.gesture === "Pointing_Up" && h.score >= minScore("Pointing_Up"));
    const pointer = hands.length === 1 && PAN_GESTURES.includes(hands[0].gesture) && hands[0].score >= minScore(hands[0].gesture) ? hands[0] : null;

    if (fingers.length >= 2) {
      panRef.current = null;
      const [a, b] = fingers;
      const d = Math.hypot((a.tipX ?? a.x) - (b.tipX ?? b.x), (a.tipY ?? a.y) - (b.tipY ?? b.y));
      if (!zoomRef.current) zoomRef.current = { d0: d, scale0: g.scale, fd: makeOneEuro() };
      const sd = zoomRef.current.fd(d, now);
      g.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoomRef.current.scale0 * (sd / zoomRef.current.d0)));
      camera.free();
      return "zoom";
    }
    zoomRef.current = null;

    if (pointer) {
      if (!panRef.current) {
        const fx = makeOneEuro();
        const fy = makeOneEuro();
        panRef.current = { fx, fy, x: fx(pointer.x, now), y: fy(pointer.y, now) };
      } else {
        const p = panRef.current;
        const sx = p.fx(pointer.x, now);
        const sy = p.fy(pointer.y, now);
        const px = pxPerUnit(size, g.scale);
        // the sky moves with the hand, so the camera centre moves against it
        g.x -= ((sx - p.x) * size.width * PAN_GAIN) / px;
        g.y -= ((sy - p.y) * size.height * PAN_GAIN) / px;
        p.x = sx;
        p.y = sy;
      }
      camera.free();
      return "pan";
    }
    panRef.current = null;
    return null;
  }, [camera]);

  return { handleHands, clear };
}
