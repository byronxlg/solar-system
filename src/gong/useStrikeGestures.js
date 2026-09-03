import { useCallback, useMemo, useRef } from "react";
import { minScore } from "../Kiosk.jsx";
import { makeOneEuro, deflectionLabel } from "./filters.js";
import { MIN_SIZE, MAX_SIZE, clamp, diameterCm, GONGS } from "./gongs.js";
import { layout } from "./useGong.js";

// Turns per-frame hand info from the kiosk into mallet strikes.
//   each hand not in a hold pose                -> a mallet: the head follows the palm; swing it
//                                                  fast at the gong and it strikes where the swing peaks.
//                                                  Two hands are two mallets.
//   two Pointing_Up hands                       -> resize the gong by the distance between the fingertips
// A hand in a hold pose (thumb up or down, two fingers, open palm) is not a
// mallet, so a hold does not also hit the gong.
const MALLET_GAIN = 1.4; // palm travel amplified so the edge of the frame reaches the edge of the stage
const HOLD_POSES = ["Open_Palm", "Thumb_Up", "Thumb_Down", "Victory", "Pointing_Up"];
// speed in stage widths per second; depth is how fast the hand grows
// (coming at the camera, which is coming at the gong), in ln size per second
const STRIKE_SPEED = 1.3;
const REARM_SPEED = 0.7;
const FULL_SPEED = 4.5;
const DEPTH_GAIN = 0.6;
const OVER = 1.08; // how far past the rim still counts, in radii
const MAX_FAST_MS = 260; // a swing that stays fast this long over the gong hits anyway
const LOST_MS = 300; // a hand gone this long starts afresh

export function useStrikeGestures(gong) {
  const { selRef, strike, setSize, holdMallet, malletsRef } = gong;
  const handsRef = useRef({}); // per hand id: { fx, fy, fu, x, y, u, t, speed, armed, fastSince }
  const resizeRef = useRef(null); // { d0, size0, fd }
  const hitRef = useRef({ at: -Infinity, strength: 0, label: null });
  const overlayRef = useRef({}); // for the kiosk: { scale, badge }

  const drop = useCallback((id) => {
    delete handsRef.current[id];
    const m = malletsRef.current[id];
    if (m) m.at = -Infinity;
  }, [malletsRef]);

  const clear = useCallback(() => {
    for (const id in handsRef.current) drop(id);
    resizeRef.current = null;
  }, [drop]);

  // One hand's frame: move its mallet, strike at the peak of a swing.
  function swing(hand, size, now) {
    const id = hand.hand || "Right";
    let f = handsRef.current[id];
    if (!f || now - f.t > LOST_MS) {
      f = handsRef.current[id] = { fx: makeOneEuro(1.2, 5), fy: makeOneEuro(1.2, 5), fu: makeOneEuro(1.2, 5), x: null, y: null, u: null, t: now, speed: 0, armed: true, fastSince: null };
    }
    const nx = 0.5 + (f.fx(hand.x, now) - 0.5) * MALLET_GAIN;
    const ny = 0.5 + (f.fy(hand.y, now) - 0.5) * MALLET_GAIN;
    const u = f.fu(Math.max(1e-3, hand.unit || 0.2), now);
    const dt = clamp((now - f.t) / 1000, 1e-3, 0.1);
    let speed = 0;
    let vx = 0, vy = 0;
    if (f.x !== null && now > f.t) {
      vx = (nx - f.x) / dt;
      vy = ((ny - f.y) * size.height) / size.width / dt;
      const vu = Math.max(0, Math.log(u / f.u) / dt) * DEPTH_GAIN;
      speed = Math.hypot(vx, vy) + vu;
      // light smoothing so one jittery frame is not a hit
      speed = f.speed + (speed - f.speed) * 0.6;
    }
    const prevSpeed = f.speed;
    f.x = nx;
    f.y = ny;
    f.u = u;
    f.t = now;
    f.speed = speed;
    const m = holdMallet(id, "hand");
    m.x = nx * size.width;
    m.y = ny * size.height;
    m.vx = vx * size.width;
    m.vy = vy * size.width;
    m.at = now;

    const { cx, cy, R } = layout(selRef.current.size, size);
    const over = Math.hypot(m.x - cx, m.y - cy) / R <= OVER;
    if (speed >= STRIKE_SPEED && over) {
      if (f.fastSince === null) f.fastSince = now;
    } else f.fastSince = null;
    // the hit is the moment the swing peaks (or a swing that stays fast)
    const peaked = prevSpeed >= STRIKE_SPEED && speed < prevSpeed;
    const stuck = f.fastSince !== null && now - f.fastSince > MAX_FAST_MS;
    if (f.armed && over && (peaked || stuck)) {
      const top = Math.max(speed, prevSpeed);
      const strength = clamp((top - STRIKE_SPEED * 0.6) / (FULL_SPEED - STRIKE_SPEED * 0.6), 0.12, 1);
      const hit = strike({ x: m.x, y: m.y, strength, source: "hand", id });
      if (hit) hitRef.current = { at: now, strength, label: `Hit ${Math.round(strength * 100)}%${deflectionLabel(hit.r)}` };
      f.armed = false;
      f.fastSince = null;
    }
    if (!f.armed && speed < REARM_SPEED) f.armed = true;
    return over;
  }

  // hands: [{ hand, gesture, score, x, y, tipX, tipY, unit }] normalised to the frame and already mirrored.
  // size: the stage in pixels. Returns { live, label }.
  const handleHands = useCallback((hands, size, now = performance.now()) => {
    const fingers = hands.filter((h) => h.gesture === "Pointing_Up" && h.score >= minScore("Pointing_Up"));
    if (fingers.length >= 2) {
      for (const id in handsRef.current) drop(id);
      const [a, b] = fingers;
      const d = Math.hypot((a.tipX ?? a.x) - (b.tipX ?? b.x), (a.tipY ?? a.y) - (b.tipY ?? b.y));
      if (!resizeRef.current) resizeRef.current = { d0: Math.max(0.02, d), size0: selRef.current.goalSize, fd: makeOneEuro() };
      const rz = resizeRef.current;
      const s = setSize(clamp(rz.size0 * (rz.fd(d, now) / rz.d0), MIN_SIZE, MAX_SIZE));
      const badge = `${diameterCm(GONGS[selRef.current.gong], s)} cm`;
      overlayRef.current = { scale: s, badge };
      return { live: "resize", label: `Resizing: ${badge}` };
    }
    resizeRef.current = null;
    overlayRef.current = { scale: selRef.current.goalSize };

    const mallets = hands.length > 2 ? [] : hands.filter((h) => !(HOLD_POSES.includes(h.gesture) && h.score >= minScore(h.gesture)));
    const seen = new Set();
    let over = false;
    for (const hand of mallets) {
      const id = hand.hand || "Right";
      if (seen.has(id)) continue; // two hands the classifier calls the same: the first keeps the mallet
      seen.add(id);
      if (swing(hand, size, now)) over = true;
    }
    for (const id in handsRef.current) if (!seen.has(id)) drop(id);
    if (mallets.length === 0) return { live: null, label: null };
    const who = mallets.length > 1 ? "Two mallets" : "Mallet";
    const label = now - hitRef.current.at < 700 ? hitRef.current.label : `${who} ${over ? "over the gong" : "in hand"}`;
    return { live: "strike", label };
  }, [selRef, strike, setSize, holdMallet, drop]);

  return useMemo(() => ({ handleHands, clear, overlayRef, hitRef, handsRef }), [handleHands, clear]);
}
