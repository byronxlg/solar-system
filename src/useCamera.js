import { useCallback, useRef, useState } from "react";
import { BODIES, bodyPosition, focusScale } from "./solar.js";

// The view onto the solar system.
//   goal: where the camera wants to be, in world units and zoom (1 = overview fit)
//   cam:  where it is this frame; the renderer eases it toward goal
//   focus: index into BODIES the camera follows, or null when free/overview
// Gestures move goal directly (and release focus); the tour and the
// thumb-up/thumb-down steps set focus and let the renderer track the body.
export const OVERVIEW = { x: 0, y: 0, scale: 1 };
export const MIN_SCALE = 0.6;
export const MAX_SCALE = 60;

export function useCamera() {
  const goalRef = useRef({ ...OVERVIEW });
  const camRef = useRef({ ...OVERVIEW });
  const focusRef = useRef(null);
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

  // Called every frame by the renderer: keeps goal on the focused body and
  // eases cam toward goal. dt in seconds.
  const track = useCallback((t, size, dt, loadedAt) => {
    const g = goalRef.current;
    const i = focusRef.current;
    if (i !== null) {
      const b = BODIES[i];
      const p = bodyPosition(b, t, loadedAt);
      g.x = p.x;
      g.y = p.y;
      g.scale = Math.min(MAX_SCALE, focusScale(b, size));
    }
    const c = camRef.current;
    const k = 1 - Math.exp(-dt * 4.5);
    c.x += (g.x - c.x) * k;
    c.y += (g.y - c.y) * k;
    c.scale = Math.exp(Math.log(c.scale) + (Math.log(g.scale) - Math.log(c.scale)) * k);
    return c;
  }, []);

  return { goalRef, camRef, focusRef, focus, setFocus, reset, free, step, track };
}
