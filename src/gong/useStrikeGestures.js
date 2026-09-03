import { useCallback, useMemo, useRef } from "react";
import { minScore } from "../Kiosk.jsx";
import { makeOneEuro } from "./filters.js";
import { MIN_SIZE, MAX_SIZE, clamp, diameterCm, GONGS } from "./gongs.js";
import { layout } from "./useGong.js";

// Turns the body and the hands from the kiosk into strikes and resizes.
//   each wrist (from the body model)            -> a mallet on that side of the gong. Swing the
//                                                  arm and the mallet strikes the centre where the
//                                                  swing peaks; faster is louder. Two arms, two
//                                                  mallets. Where the hand is does not matter.
//   two Pointing_Up hands (adjust mode only)    -> resize the gong by the distance between the fingertips
// Nothing strikes in adjust: the hands there are setting the gong up.
//
// Speeds are in shoulder widths per second, so a person far from the camera
// swings as hard as one close to it. Depth is the wrist coming at the camera
// (the body model's z, which shrinks toward the viewer).
export const STRIKE_SPEED = 3; // a swing this fast is a strike
export const REARM_SPEED = 1.5; // the arm has to slow to this before it can strike again
export const FULL_SPEED = 9; // this fast is a full-strength hit
const DEPTH_GAIN = 0.5;
const MAX_FAST_MS = 300; // a swing that stays fast this long hits anyway
const MIN_GAP_MS = 140; // two hits from one arm are at least this far apart
const LOST_MS = 300; // a wrist gone this long starts afresh
const MIN_VIS = 0.5;
const MIN_UNIT = 0.08; // shoulder width floor, frame widths: someone far away or turned side-on
const SCATTER = 0.1; // a hit lands within this of the centre, in radii, so the plate still rocks a little

export function useStrikeGestures(gong) {
  const { selRef, strike, setSize, holdMallet, malletsRef } = gong;
  const armsRef = useRef({}); // per side: { fx, fy, fz, x, y, z, t, speed, armed, fastSince, lastHit }
  const resizeRef = useRef(null); // { d0, size0, fd }
  const hitRef = useRef({ at: -Infinity, strength: 0, label: null });
  const overlayRef = useRef({ swing: {} }); // for the kiosk: { scale, badge, swing: { Left: { k, hitAt }, Right } }

  const drop = useCallback((id) => {
    delete armsRef.current[id];
    delete overlayRef.current.swing[id];
    const m = malletsRef.current[id];
    if (m) m.at = -Infinity;
  }, [malletsRef]);

  const clear = useCallback(() => {
    for (const id in armsRef.current) drop(id);
    resizeRef.current = null;
  }, [drop]);

  // One arm's frame: read its speed, strike at the peak of a swing.
  // wrist: { x, y, z, vis } normalised and mirrored. unit: shoulder width in frame widths.
  function swing(id, wrist, unit, size, now) {
    let f = armsRef.current[id];
    if (!f || now - f.t > LOST_MS) {
      f = armsRef.current[id] = { fx: makeOneEuro(1.5, 6), fy: makeOneEuro(1.5, 6), fz: makeOneEuro(1, 3), x: null, y: null, z: null, t: now, speed: 0, armed: true, fastSince: null, lastHit: -Infinity };
    }
    const aspect = size.height / size.width;
    const x = f.fx(wrist.x, now);
    const y = f.fy(wrist.y, now);
    const z = f.fz(wrist.z || 0, now);
    const dt = clamp((now - f.t) / 1000, 1e-3, 0.1);
    let speed = 0;
    if (f.x !== null && now > f.t) {
      const vx = (x - f.x) / unit / dt;
      const vy = ((y - f.y) * aspect) / unit / dt;
      const vz = Math.max(0, -(z - f.z)) / unit / dt * DEPTH_GAIN; // toward the camera only
      speed = Math.hypot(vx, vy) + vz;
      // light smoothing so one jittery frame is not a hit
      speed = f.speed + (speed - f.speed) * 0.6;
    }
    const prevSpeed = f.speed;
    f.x = x;
    f.y = y;
    f.z = z;
    f.t = now;
    f.speed = speed;
    const m = holdMallet(id, "body");
    m.side = id === "Left" ? -1 : 1;
    m.cock = clamp(speed / STRIKE_SPEED, 0, 1);
    m.at = now;

    if (speed >= STRIKE_SPEED) {
      if (f.fastSince === null) f.fastSince = now;
    } else f.fastSince = null;
    // the hit is the moment the swing peaks (or a swing that stays fast)
    const peaked = prevSpeed >= STRIKE_SPEED && speed < prevSpeed;
    const stuck = f.fastSince !== null && now - f.fastSince > MAX_FAST_MS;
    let hitAt = null;
    if (f.armed && (peaked || stuck) && now - f.lastHit > MIN_GAP_MS) {
      const top = Math.max(speed, prevSpeed);
      const strength = clamp((top - STRIKE_SPEED * 0.6) / (FULL_SPEED - STRIKE_SPEED * 0.6), 0.12, 1);
      const { cx, cy, R } = layout(selRef.current.size, size);
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SCATTER * R;
      const hit = strike({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, strength, source: "body", id });
      if (hit) {
        hitRef.current = { at: now, strength, label: `Hit ${Math.round(strength * 100)}%` };
        m.hit = 1;
        f.lastHit = now;
        hitAt = now;
      }
      f.armed = false;
      f.fastSince = null;
    }
    if (!f.armed && speed < REARM_SPEED) f.armed = true;
    const sw = overlayRef.current.swing[id] || (overlayRef.current.swing[id] = {});
    sw.k = clamp(speed / FULL_SPEED, 0, 1);
    if (hitAt) sw.hitAt = hitAt;
    return f;
  }

  // body: { left, right, unit } from the kiosk, mirrored, or null for nobody.
  // size: the stage in pixels. mode: no strikes in "adjust". Returns { live, label } or null.
  const handlePose = useCallback((body, size, now = performance.now(), mode = "play") => {
    const arms = [];
    if (body && mode !== "adjust") {
      const unit = Math.max(MIN_UNIT, body.unit || 0);
      for (const [id, wrist] of [["Left", body.left], ["Right", body.right]]) {
        if (!wrist || wrist.vis < MIN_VIS) continue;
        arms.push(id);
        swing(id, wrist, unit, size, now);
      }
    }
    for (const id in armsRef.current) if (!arms.includes(id)) drop(id);
    if (arms.length === 0) return null;
    const who = arms.length > 1 ? "Both mallets" : "Mallet";
    const fastest = Math.max(...arms.map((id) => armsRef.current[id].speed));
    const label = now - hitRef.current.at < 700 ? hitRef.current.label : fastest >= STRIKE_SPEED ? "Swinging" : `${who} ready`;
    return { live: "strike", label };
  }, [selRef, strike, holdMallet, drop]);

  // hands: [{ hand, gesture, score, x, y, tipX, tipY, unit }] normalised to the frame and already mirrored.
  // size: the stage in pixels. mode: resizing only happens in "adjust". Returns { live, label } or null.
  const handleHands = useCallback((hands, size, now = performance.now(), mode = "play") => {
    const fingers = mode === "adjust" ? hands.filter((h) => h.gesture === "Pointing_Up" && h.score >= minScore("Pointing_Up")) : [];
    if (fingers.length >= 2) {
      const [a, b] = fingers;
      const d = Math.hypot((a.tipX ?? a.x) - (b.tipX ?? b.x), (a.tipY ?? a.y) - (b.tipY ?? b.y));
      if (!resizeRef.current) resizeRef.current = { d0: Math.max(0.02, d), size0: selRef.current.goalSize, fd: makeOneEuro() };
      const rz = resizeRef.current;
      const s = setSize(clamp(rz.size0 * (rz.fd(d, now) / rz.d0), MIN_SIZE, MAX_SIZE));
      const badge = `${diameterCm(GONGS[selRef.current.gong], s)} cm`;
      overlayRef.current.scale = s;
      overlayRef.current.badge = badge;
      return { live: "resize", label: `Resizing: ${badge}` };
    }
    resizeRef.current = null;
    overlayRef.current.scale = selRef.current.goalSize;
    overlayRef.current.badge = null;
    return null;
  }, [selRef, setSize]);

  return useMemo(() => ({ handleHands, handlePose, clear, overlayRef, hitRef, armsRef }), [handleHands, handlePose, clear]);
}
