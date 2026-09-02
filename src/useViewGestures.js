import { useCallback, useMemo, useRef } from "react";
import { minScore } from "./Kiosk.jsx";
import { BODIES, bodyPosition, drawRadius, pxPerUnit } from "./solar.js";
import { MIN_SCALE, MAX_SCALE, MAX_RATE } from "./useCamera.js";

// Turns per-frame hand info from the kiosk into camera movement.
//   one Pointing_Up hand                        -> a cursor on the sky; aim at a body and hold to fly there (point)
//   one hand grabbing (index touching thumb)    -> pan: the sky follows the hand as seen on screen
//   two Pointing_Up hands                       -> zoom by the distance between the two index fingertips (pinch)
//   one Open_Palm                               -> fly: the palm is a joystick. Move it from where it
//                                                  appeared to drift that way; bring it closer to push in,
//                                                  pull it back to pull out
//   one Victory hand (two fingers)              -> time dial: raise it to run time faster, lower it to
//                                                  slow and then reverse; drop the hand and time eases back to 1x
// Which of these are live depends on the mode (see handleHands).
const PAN_GAIN = 2.2; // screen widths of travel per normalised hand unit
const PAN_GESTURES = ["Grab"]; // synthesised by the Kiosk from landmarks: index touching thumb

// Fly: dead zone and full-deflection radius in normalised frame units, top
// speed in screen widths per second, and the hand-size ratio (closer/further
// than where it appeared) that gives full zoom, at ZOOM_RATE octaves per second.
export const FLY_DEAD = 0.05;
export const FLY_FULL = 0.22;
const FLY_SPEED = 1.1;
export const FLY_DEPTH_DEAD = 0.1; // ln ratio, so about 10% bigger or smaller
const FLY_DEPTH_FULL = 0.45;
const ZOOM_RATE = 1.4;

// Point: fingertip travel is amplified so the edge of the frame reaches the
// edge of the sky; a body within SNAP_PX (or its own radius) captures the
// cursor and DWELL_MS aimed at it flies there.
const POINT_GAIN = 1.4;
const SNAP_PX = 48;
export const DWELL_MS = 900;

// Time dial: hand height maps to rate. The middle band is 1x; above it speeds
// up to MAX_RATE at the top, below it slows, then runs backwards to
// -MAX_RATE at the bottom.
export const DIAL_DEAD = 0.1;
export const DIAL_SPAN = 0.32;

// One Euro filter (Casiez, Roussel, Vogel 2012): heavy smoothing while the
// hand is still or slow, which removes landmark jitter, and light smoothing
// while it moves fast, so there is no visible lag. Units: normalised frame
// coordinates, seconds.
const MIN_CUTOFF = 1.2; // Hz. Lower = steadier when still
const BETA = 4; // how fast smoothing relaxes as speed rises
const D_CUTOFF = 1;
const smoothing = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export function makeOneEuro(minCutoff = MIN_CUTOFF, beta = BETA) {
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
    x += smoothing(minCutoff + beta * Math.abs(dx), dt) * (value - x);
    return x;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Joystick response: nothing inside the dead zone, then a smooth ramp to 1.
export function deflection(d, dead, full) {
  const u = clamp((d - dead) / (full - dead), 0, 1);
  return u * u * (3 - 2 * u);
}
// Time dial: normalised hand height (0 top, 1 bottom) to rate.
export function dialRate(y) {
  const v = 0.5 - y;
  const u = deflection(Math.abs(v), DIAL_DEAD, DIAL_DEAD + DIAL_SPAN);
  if (u === 0) return 1;
  const r = Math.pow(MAX_RATE, u);
  return v > 0 ? r : -r;
}

const one = (hands, name) => (hands.length === 1 && hands[0].gesture === name && hands[0].score >= minScore(name) ? hands[0] : null);

// camera: from useCamera. Pans, zooms and flights write to camera.goalRef and
// release any focused body, so the view stays where the hand left it.
// pointerRef and overlayRef are written every frame for the sky and the kiosk
// to draw from.
export function useViewGestures(camera) {
  // only the stable parts of the camera, so handleHands survives a focus change
  const { goalRef, camRef, clockRef, setFocus, free, setRate } = camera;
  const panRef = useRef(null); // { fx, fy, x, y }: filters and last smoothed position while panning
  const zoomRef = useRef(null); // { d0, scale0, fd } while zooming
  const flyRef = useRef(null); // { x0, y0, unit0, fx, fy, fu, last } while flying
  const pointRef = useRef(null); // { fx, fy } while pointing
  const pointerRef = useRef(null); // { x, y, target, progress, firedAt, name } in sky pixels, or null
  const overlayRef = useRef({}); // { fly, dial } for the kiosk overlays, normalised sky-space coords
  const dwellRef = useRef({ target: null, since: 0, fired: null });

  const clear = useCallback(() => {
    panRef.current = null;
    zoomRef.current = null;
    flyRef.current = null;
    pointRef.current = null;
    pointerRef.current = null;
    overlayRef.current = {};
    dwellRef.current = { target: null, since: 0, fired: null };
  }, []);

  // The cursor: one pointing hand aims at the sky. Returns the live label.
  function point(hand, size, now) {
    const { width: w, height: h } = size;
    if (!pointRef.current) pointRef.current = { fx: makeOneEuro(1, 6), fy: makeOneEuro(1, 6) };
    const f = pointRef.current;
    const x = (0.5 + (f.fx(hand.tipX, now) - 0.5) * POINT_GAIN) * w;
    const y = (0.5 + (f.fy(hand.tipY, now) - 0.5) * POINT_GAIN) * h;
    const cam = camRef.current;
    const clock = clockRef.current;
    const px = pxPerUnit(size, cam.scale);
    let target = null;
    let best = Infinity;
    BODIES.forEach((b, i) => {
      const p = bodyPosition(b, clock.t, clock.loadedAt);
      const sx = w / 2 + (p.x - cam.x) * px;
      const sy = h / 2 + (p.y - cam.y) * px;
      const d = Math.hypot(sx - x, sy - y);
      const reach = Math.max(SNAP_PX, drawRadius(b) * px + 20);
      if (d < reach && d < best) {
        best = d;
        target = i;
      }
    });
    const dw = dwellRef.current;
    if (target !== dw.target) {
      dw.target = target;
      dw.since = now;
      if (target === null) dw.fired = null;
    }
    const progress = target === null ? 0 : clamp((now - dw.since) / DWELL_MS, 0, 1);
    let firedAt = pointerRef.current?.firedAt ?? -Infinity;
    if (target !== null && progress >= 1 && dw.fired !== target) {
      dw.fired = target;
      firedAt = now;
      setFocus(target);
    }
    pointerRef.current = { x, y, target, progress, firedAt, name: target === null ? null : BODIES[target].name };
    return target === null ? "Aiming" : dw.fired === target ? `Flying to ${BODIES[target].name}` : `Aiming at ${BODIES[target].name}`;
  }

  // hands: [{ gesture, score, x, y, tipX, tipY, unit }] with positions normalised to the
  // video frame (already mirrored to match the sky); x, y is the palm, tipX, tipY the
  // index fingertip (defaults to the palm), unit the hand size as a fraction of the frame width.
  // size: { width, height } of the sky container, used to scale pan distance.
  // now: timestamp in ms, for the filters. mode: "browse" only points; "navigate" does everything.
  // Returns { live, label } for the HUD, live being "point" | "pan" | "zoom" | "fly" | "time" | null.
  const handleHands = useCallback((hands, size, now = performance.now(), mode = "navigate") => {
    const g = goalRef.current;
    const overlay = {};
    let result = { live: null, label: null };
    const finger = one(hands, "Pointing_Up");
    const finish = () => {
      overlayRef.current = overlay;
      if (!finger) {
        pointRef.current = null;
        pointerRef.current = null;
        dwellRef.current = { target: null, since: 0, fired: null };
      }
      return result;
    };

    if (finger) {
      panRef.current = zoomRef.current = flyRef.current = null;
      result = { live: "point", label: point(finger, size, now) };
      return finish();
    }
    if (mode !== "navigate") {
      panRef.current = zoomRef.current = flyRef.current = null;
      return finish();
    }

    const fingers = hands.filter((h) => h.gesture === "Pointing_Up" && h.score >= minScore("Pointing_Up"));
    if (fingers.length >= 2) {
      panRef.current = flyRef.current = null;
      const [a, b] = fingers;
      const d = Math.hypot((a.tipX ?? a.x) - (b.tipX ?? b.x), (a.tipY ?? a.y) - (b.tipY ?? b.y));
      if (!zoomRef.current) zoomRef.current = { d0: d, scale0: g.scale, fd: makeOneEuro() };
      const sd = zoomRef.current.fd(d, now);
      g.scale = clamp(zoomRef.current.scale0 * (sd / zoomRef.current.d0), MIN_SCALE, MAX_SCALE);
      free();
      result = { live: "zoom", label: null };
      return finish();
    }
    zoomRef.current = null;

    const pointer = hands.length === 1 && PAN_GESTURES.includes(hands[0].gesture) && hands[0].score >= minScore(hands[0].gesture) ? hands[0] : null;
    if (pointer) {
      flyRef.current = null;
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
      free();
      result = { live: "pan", label: null };
      return finish();
    }
    panRef.current = null;

    const palm = one(hands, "Open_Palm");
    if (palm) {
      const f = flyRef.current;
      if (!f || now - f.last > 400) {
        const fx = makeOneEuro();
        const fy = makeOneEuro();
        const fu = makeOneEuro(0.8, 2);
        flyRef.current = { x0: palm.x, y0: palm.y, unit0: Math.max(1e-3, palm.unit || 1e-3), fx, fy, fu, last: now };
        fx(palm.x, now);
        fy(palm.y, now);
        fu(palm.unit || 0, now);
        overlay.fly = { x0: palm.x, y0: palm.y, x: palm.x, y: palm.y, depth: 0 };
        result = { live: "fly", label: null };
        return finish();
      }
      const dt = clamp((now - f.last) / 1000, 0, 0.1);
      f.last = now;
      const x = f.fx(palm.x, now);
      const y = f.fy(palm.y, now);
      const u = f.fu(palm.unit || f.unit0, now);
      const dx = x - f.x0;
      const dy = y - f.y0;
      const d = Math.hypot(dx, dy);
      const k = deflection(d, FLY_DEAD, FLY_FULL);
      const px = pxPerUnit(size, g.scale);
      if (k > 0) {
        // drift the way the hand points, in screen terms, at up to FLY_SPEED screen widths a second
        const v = (FLY_SPEED * size.width * k) / px;
        g.x += (dx / d) * v * dt;
        g.y += (dy / d) * v * dt;
      }
      const depth = Math.log(u / f.unit0); // positive when the hand comes closer
      const kd = deflection(Math.abs(depth), FLY_DEPTH_DEAD, FLY_DEPTH_FULL) * Math.sign(depth);
      if (kd !== 0) g.scale = clamp(g.scale * Math.pow(2, ZOOM_RATE * kd * dt), MIN_SCALE, MAX_SCALE);
      if (k > 0 || kd !== 0) free();
      overlay.fly = { x0: f.x0, y0: f.y0, x, y, depth: kd };
      result = { live: "fly", label: null };
      return finish();
    }
    flyRef.current = null;

    const dial = one(hands, "Victory");
    if (dial) {
      const rate = dialRate(dial.y);
      setRate(rate, now);
      overlay.dial = { x: dial.x, y: dial.y, rate };
      result = { live: "time", label: null };
      return finish();
    }
    return finish();
  }, [goalRef, camRef, clockRef, setFocus, free, setRate]);

  return useMemo(() => ({ handleHands, clear, pointerRef, overlayRef }), [handleHands, clear]);
}
