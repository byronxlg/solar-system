import { useCallback, useMemo, useRef, useState } from "react";
import { BODIES, bodyPosition, focusScale } from "./solar.js";

// The view onto the solar system.
//   goal: where the camera wants to be, in world units and zoom (1 = overview fit)
//   cam:  where it is this frame; the renderer eases it toward goal
//   focus: index into BODIES the camera follows, or null when free/overview
//   clock: sim time. t is sim seconds since load; rate is how fast it runs
//          (1 = an Earth year every YEAR_S, negative = backwards). goalRate is
//          what the time dial asks for and rate eases toward it; the dial has
//          to keep asking (heldAt) or goalRate falls back to 1.
// Gestures move goal directly (and release focus); the tour and the
// thumb-up/thumb-down steps set focus and let the renderer track the body.
export const OVERVIEW = { x: 0, y: 0, scale: 1 };
export const MIN_SCALE = 0.6;
export const MAX_SCALE = 60;
export const MAX_RATE = 30; // time dial range: 1/30 to 30 times, either way
const DIAL_HOLD_MS = 250;

export function useCamera() {
  const goalRef = useRef({ ...OVERVIEW });
  const camRef = useRef({ ...OVERVIEW });
  const focusRef = useRef(null);
  const clockRef = useRef({ t: 0, rate: 1, goalRate: 1, heldAt: -Infinity, loadedAt: Date.now() });
  const [focus, setFocusState] = useState(null);

  const setFocus = useCallback((i) => {
    focusRef.current = i;
    setFocusState(i);
  }, []);

  const reset = useCallback(() => {
    goalRef.current = { ...OVERVIEW };
    setFocus(null);
  }, [setFocus]);

  const free = useCallback(() => {
    if (focusRef.current !== null) setFocus(null);
  }, [setFocus]);

  const step = useCallback((dir) => {
    const cur = focusRef.current;
    const n = BODIES.length;
    const next = cur === null ? (dir > 0 ? 0 : n - 1) : (cur + dir + n) % n;
    setFocus(next);
    return next;
  }, [setFocus]);

  // The time dial: rate in [-MAX_RATE, MAX_RATE], kept only while called.
  const setRate = useCallback((rate, now = performance.now()) => {
    const c = clockRef.current;
    c.goalRate = Math.max(-MAX_RATE, Math.min(MAX_RATE, rate));
    c.heldAt = now;
  }, []);

  // Called every frame by the renderer: advances the clock, keeps goal on the
  // focused body and eases cam toward goal. dt in seconds; returns cam.
  const track = useCallback((size, dt, now = performance.now()) => {
    const c = clockRef.current;
    if (now - c.heldAt > DIAL_HOLD_MS) c.goalRate = 1;
    c.rate += (c.goalRate - c.rate) * (1 - Math.exp(-dt * 6));
    c.t += dt * c.rate;

    const g = goalRef.current;
    const i = focusRef.current;
    if (i !== null) {
      const b = BODIES[i];
      const p = bodyPosition(b, c.t, c.loadedAt);
      g.x = p.x;
      g.y = p.y;
      g.scale = Math.min(MAX_SCALE, focusScale(b, size));
    }
    const cam = camRef.current;
    const k = 1 - Math.exp(-dt * 4.5);
    cam.x += (g.x - cam.x) * k;
    cam.y += (g.y - cam.y) * k;
    cam.scale = Math.exp(Math.log(cam.scale) + (Math.log(g.scale) - Math.log(cam.scale)) * k);
    return cam;
  }, []);

  // Memoised so consumers can depend on it without re-running per render;
  // only `focus` changes between renders.
  return useMemo(
    () => ({ goalRef, camRef, focusRef, clockRef, focus, setFocus, reset, free, step, setRate, track }),
    [focus, setFocus, reset, free, step, setRate, track]
  );
}

// Label for the HUD when time is not running at 1x, else null.
export function rateLabel(rate) {
  if (Math.abs(Math.log(Math.abs(rate) || 1)) < 0.05 && rate > 0) return null;
  const a = Math.abs(rate);
  const n = a >= 10 ? String(Math.round(a)) : a >= 1 ? a.toFixed(1) : `1/${(1 / a).toFixed(1)}`;
  return rate < 0 ? `Rewind ×${n}` : `Time ×${n}`;
}
