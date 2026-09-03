import { useCallback, useMemo, useRef } from "react";
import { minScore } from "../Kiosk.jsx";
import { makeOneEuro } from "./filters.js";
import { MIN_SIZE, MAX_SIZE, clamp, diameterCm, GONGS } from "./gongs.js";
import { layout } from "./useGong.js";

// Turns the body and the hands from the kiosk into strikes and resizes.
//   each arm (from the body model)              -> a mallet on that side of the gong. A stroke of
//                                                  the arm strikes the centre; faster is louder. Two
//                                                  arms, two mallets. Where the hand is does not matter.
//   two Pointing_Up hands (adjust mode only)    -> resize the gong by the distance between the fingertips
// Nothing strikes in adjust: the hands there are setting the gong up.
//
// A stroke is the movement you would make to hit a real gong, and nothing
// less: the whole arm drives the wrist through a straight run of at least
// MIN_TRAVEL in under MAX_STROKE_MS, reaching STRIKE_SPEED, with the elbow
// coming along (ELBOW_TRAVEL). A wave, a wrist flick, a reach or a scratch
// fails one of those. The hit fires as the stroke arrives (the wrist slowing
// after its peak), and the arm has to come to rest before it can hit again.
// Distances are metres and speeds metres per second, from the body model's
// world landmarks (its 3D estimate about the hips), so a forward strike at
// the camera counts as much as a sweep across.
export const STRIKE_SPEED = 2.2; // peak wrist speed a stroke has to reach, m/s
export const FULL_SPEED = 5; // this fast is a full-strength hit
export const MIN_TRAVEL = 0.3; // how far the wrist has to run in one stroke, m
export const ELBOW_TRAVEL = 0.1; // how far the elbow has to come with it, m
export const STRAIGHT = 0.7; // travel / path length: a stroke is a straight run, not a wander
export const MAX_STROKE_MS = 600; // the run has to happen inside this
const REST_SPEED = 0.7; // below this the arm is at rest: a stroke starts here, and the arm re-arms here
const ARRIVE = 0.75; // the hit fires once the speed has dropped to this fraction of the stroke's peak
const SPEED_MS = 100; // speed is travel over this long, so one dropped or repeated frame is not a stop
const HISTORY_MS = 900;
const LOST_MS = 300; // an arm gone this long starts afresh
const MIN_VIS = 0.5;
const SCATTER = 0.1; // a hit lands within this of the centre, in radii, so the plate still rocks a little

export function useStrikeGestures(gong) {
  const { selRef, strike, setSize, holdMallet, malletsRef } = gong;
  const armsRef = useRef({}); // per side: { f, hist, t, speed, peak, travel, armed, lastHit }
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

  // One arm's frame. wrist and elbow: { x, y, z } in metres.
  function swing(id, wrist, elbow, size, now) {
    let f = armsRef.current[id];
    if (!f || now - f.t > LOST_MS) {
      const axis = () => makeOneEuro(1.5, 8);
      f = armsRef.current[id] = { fw: [axis(), axis(), axis()], fe: [axis(), axis(), axis()], hist: [], t: now, speed: 0, peak: 0, travel: 0, stroke: false, armed: true, lastHit: -Infinity };
    }
    const w = { x: f.fw[0](wrist.x, now), y: f.fw[1](wrist.y, now), z: f.fw[2](wrist.z, now) };
    const e = { x: f.fe[0](elbow.x, now), y: f.fe[1](elbow.y, now), z: f.fe[2](elbow.z, now) };
    const last = f.hist[f.hist.length - 1];
    const step = last ? dist(w, last.w) : 0;
    // speed over the last SPEED_MS, not one frame
    let ref = f.hist.length - 1;
    while (ref > 0 && now - f.hist[ref].t < SPEED_MS) ref -= 1;
    const speed = last && now > f.hist[ref].t ? dist(w, f.hist[ref].w) / Math.max(SPEED_MS / 1000, (now - f.hist[ref].t) / 1000) : 0;
    const prevSpeed = f.speed;
    f.t = now;
    f.speed = speed;
    f.hist.push({ t: now, w, e, speed, step });
    while (f.hist.length && now - f.hist[0].t > HISTORY_MS) f.hist.shift();

    // the stroke: from the last moment the arm was at rest to now. The
    // sample just added does not count as rest, so a stroke that has just
    // stopped is still the stroke that has just stopped.
    let start = Math.max(0, f.hist.length - 2);
    while (start > 0 && f.hist[start].speed >= REST_SPEED) start -= 1;
    const s0 = f.hist[start];
    const duration = now - s0.t;
    let path = 0;
    let peak = 0;
    for (let i = start + 1; i < f.hist.length; i++) {
      path += f.hist[i].step;
      peak = Math.max(peak, f.hist[i].speed);
    }
    const travel = dist(w, s0.w);
    const elbowTravel = dist(e, s0.e);
    const straight = path > 0 ? travel / path : 0;
    f.peak = peak;
    f.travel = travel;
    // once a run qualifies it stays a stroke until the arm rests, so the hit
    // can fire as it slows even if it stops dead in one frame
    if (duration <= MAX_STROKE_MS && travel >= MIN_TRAVEL && peak >= STRIKE_SPEED && straight >= STRAIGHT && elbowTravel >= ELBOW_TRAVEL) f.stroke = true;
    const moving = speed >= REST_SPEED;

    const m = holdMallet(id, "body");
    m.side = id === "Left" ? -1 : 1;
    m.cock = moving ? clamp(travel / MIN_TRAVEL, 0, 1) : 0;
    m.at = now;

    // the hit: the stroke arriving, its speed off the peak
    let hitAt = null;
    if (f.armed && f.stroke && speed <= peak * ARRIVE && speed < prevSpeed) {
      const strength = clamp((peak - STRIKE_SPEED * 0.7) / (FULL_SPEED - STRIKE_SPEED * 0.7), 0.15, 1);
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
    }
    if (!moving) {
      f.armed = true;
      f.stroke = false;
    }
    const sw = overlayRef.current.swing[id] || (overlayRef.current.swing[id] = {});
    // the ring fills as the stroke builds: how far it has run, and how fast
    sw.k = moving ? clamp(travel / MIN_TRAVEL, 0, 1) * clamp(peak / STRIKE_SPEED, 0.3, 1) : 0;
    if (hitAt) sw.hitAt = hitAt;
    return f;
  }

  // body: { left, right, leftElbow, rightElbow } from the kiosk, each with
  // { vis, world: { x, y, z } } in metres, or null for nobody. size: the
  // stage in pixels. mode: no strikes in "adjust". Returns { live, label } or null.
  const handlePose = useCallback((body, size, now = performance.now(), mode = "play") => {
    const arms = [];
    if (body && mode !== "adjust") {
      for (const [id, wrist, elbow] of [["Left", body.left, body.leftElbow], ["Right", body.right, body.rightElbow]]) {
        if (!wrist?.world || !elbow?.world || wrist.vis < MIN_VIS || elbow.vis < MIN_VIS) continue;
        arms.push(id);
        swing(id, wrist.world, elbow.world, size, now);
      }
    }
    for (const id in armsRef.current) if (!arms.includes(id)) drop(id);
    if (arms.length === 0) return null;
    const who = arms.length > 1 ? "Both mallets" : "Mallet";
    const winding = arms.some((id) => armsRef.current[id].speed >= REST_SPEED);
    const label = now - hitRef.current.at < 700 ? hitRef.current.label : winding ? "Swinging" : `${who} ready`;
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

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
