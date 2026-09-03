import { useCallback, useMemo, useRef, useState } from "react";
import { GONGS, MALLETS, MIN_SIZE, MAX_SIZE, clamp, diameterCm } from "./gongs.js";
import * as audio from "./audio.js";

// The gong on the stage: which gong and mallet, how big, and how it is
// moving right now. Strikes come from hands, the mouse, the keys and the
// gong bath and all go through strike(); the stage draws from the refs
// every frame and React only re-renders when a name or a number changes.
//
//   sel:   { gong, mallet } indices, size (multiple of the base diameter)
//          and goalSize (size eases toward it)
//   phys:  swing (pendulum angle, radians), tilt (pushed back), rock (the
//          plate rocking about the axis across the hit: direction and
//          amount), shake (the stage jolting on a hard hit), flash, ripples,
//          sparks, glints, hits, lastHit
//   mallets: one per holder, keyed by id ("Left", "Right" for the arms,
//          "mouse"): where the head is on the stage in pixels, its velocity
//          in pixels per second, when it was last moved, and its recoil. A
//          body mallet (source "body") is not steered: it rests beside the
//          gong on its side, cocks back as the arm speeds up (cock 0..1) and
//          flies to the centre on a hit (hit 1, easing back to 0).

// A body mallet's swing in: how long the head takes to come back to rest
// after a hit, and how far it cocks back as the arm winds up, in radii.
const HIT_MS = 380;
const COCK_R = 0.22;

export function useGong() {
  const selRef = useRef({ gong: 0, mallet: 0, size: 1, goalSize: 1 });
  const physRef = useRef({ swing: 0, swingVel: 0, tilt: 0, tiltVel: 0, rockX: 0, rockY: 0, rock: 0, rockVel: 0, shakeX: 0, shakeY: 0, shake: 0, flash: 0, ripples: [], sparks: [], glints: [], hits: 0, lastHit: null, damped: -Infinity });
  const malletsRef = useRef({});
  const sizeRef = useRef({ width: 800, height: 600 }); // the stage's size, kept by the stage
  const [gongIndex, setGongIndex] = useState(0);
  const [malletIndex, setMalletIndex] = useState(0);
  const [cm, setCm] = useState(diameterCm(GONGS[0], 1));
  const [hits, setHits] = useState(0);
  const [best, setBest] = useState(0); // the loudest hit so far, 0..1
  const [audioOn, setAudioOn] = useState(false);

  const setGong = useCallback((i) => {
    const n = GONGS.length;
    const k = ((i % n) + n) % n;
    selRef.current.gong = k;
    setGongIndex(k);
    setCm(diameterCm(GONGS[k], selRef.current.goalSize));
  }, []);
  const stepGong = useCallback((dir) => setGong(selRef.current.gong + dir), [setGong]);

  const setMallet = useCallback((i) => {
    const n = MALLETS.length;
    const k = ((i % n) + n) % n;
    selRef.current.mallet = k;
    setMalletIndex(k);
  }, []);
  const stepMallet = useCallback((dir) => setMallet(selRef.current.mallet + dir), [setMallet]);

  const setSize = useCallback((k) => {
    const s = clamp(k, MIN_SIZE, MAX_SIZE);
    selRef.current.goalSize = s;
    setCm(diameterCm(GONGS[selRef.current.gong], s));
    return s;
  }, []);
  const scaleSize = useCallback((f) => setSize(selRef.current.goalSize * f), [setSize]);

  const wake = useCallback(() => {
    const ok = audio.unlock();
    setAudioOn(ok);
    return ok;
  }, []);

  // The mallet held by `id`, made on first use.
  const mallet = useCallback((id, source = id) => {
    const ms = malletsRef.current;
    if (!ms[id]) ms[id] = { id, source, x: 0, y: 0, vx: 0, vy: 0, at: -Infinity, recoil: 0, hit: 0, cock: 0 };
    return ms[id];
  }, []);

  // Strike at stage pixel (x, y) with strength 0..1. Returns the hit
  // { r, angle, strength } or null for a miss. `id` names the mallet that
  // recoils.
  const strike = useCallback(({ x, y, strength = 0.7, source = "mouse", id = null }) => {
    const sel = selRef.current;
    const { cx, cy, R } = layout(sel.size, sizeRef.current);
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx, dy) / R;
    if (r > 1.04) return null;
    const s = clamp(strength, 0.05, 1);
    const gong = GONGS[sel.gong];
    const mallet = MALLETS[sel.mallet];
    const now = performance.now();
    const p = physRef.current;
    audio.strike({ gong, mallet, size: sel.size, r: Math.min(1, r), strength: s, pan: dx / R });
    // physics: a hit off centre swings it and rocks the plate about the axis
    // across the hit; any hit pushes it back; a hard one jolts the stage
    p.swingVel += (dx / R) * s * 0.9 * (mallet.hardness * 0.4 + 0.6);
    p.tiltVel += s * 2.4;
    if (r > 0.08) {
      const rr = Math.min(1, r);
      const weight = s * rr * 5;
      // rock direction blends toward the new hit, weighted by how hard
      p.rockX = (p.rockX * Math.abs(p.rockVel) + (dx / R / rr) * weight) / (Math.abs(p.rockVel) + weight);
      p.rockY = (p.rockY * Math.abs(p.rockVel) + (dy / R / rr) * weight) / (Math.abs(p.rockVel) + weight);
      p.rockVel += weight;
    }
    if (s > 0.55) {
      p.shake = Math.min(1, p.shake + (s - 0.55) * 2.2 * Math.min(1.4, sel.size));
      p.shakeSeed = Math.random() * 1000;
    }
    p.flash = Math.min(1, p.flash + 0.5 + s * 0.6);
    p.ripples.push({ x: dx / R, y: dy / R, at: now, strength: s });
    if (p.ripples.length > 12) p.ripples.shift();
    // glints: a hard hit throws light off the face
    if (s > 0.5) {
      const count = Math.round((s - 0.5) * 24);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 0.2 + Math.random() * 0.8;
        p.glints.push({ x: dx / R + Math.cos(a) * d * 0.9, y: dy / R + Math.sin(a) * d * 0.9, at: now, life: 250 + Math.random() * 500, size: 0.4 + Math.random() });
      }
    }
    if (mallet.hardness > 0.6 && s > 0.45) {
      const count = Math.round((mallet.hardness - 0.5) * s * 30);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (0.6 + Math.random() * 1.4) * s;
        p.sparks.push({ x: dx / R, y: dy / R, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, at: now, life: 350 + Math.random() * 450 });
      }
    }
    if (id && malletsRef.current[id]) malletsRef.current[id].recoil = 1;
    p.hits += 1;
    p.lastHit = { r: Math.min(1, r), angle: Math.atan2(dy, dx), strength: s, at: now, source };
    setHits(p.hits);
    if (source !== "bath" && s > (p.best || 0)) {
      p.best = s;
      setBest(s);
    }
    return p.lastHit;
  }, []);

  // A palm on the plate.
  const damp = useCallback(() => {
    audio.damp();
    const p = physRef.current;
    p.damped = performance.now();
    p.tiltVel *= 0.2;
    p.swingVel *= 0.3;
    p.rockVel *= 0.2;
    p.ripples = [];
  }, []);

  // Called by the stage every frame. dt in seconds.
  const track = useCallback((size, dt, now = performance.now()) => {
    sizeRef.current = size;
    const sel = selRef.current;
    const k = 1 - Math.exp(-dt * 5);
    sel.size += (sel.goalSize - sel.size) * k;
    const p = physRef.current;
    // pendulum: a big gong swings slowly
    const w = 2.2 / Math.sqrt(sel.size);
    p.swingVel += (-w * w * p.swing - 0.7 * p.swingVel) * dt;
    p.swing += p.swingVel * dt;
    // pushed back and springing forward, faster and damped harder
    p.tiltVel += (-30 * p.tilt - 4.5 * p.tiltVel) * dt;
    p.tilt += p.tiltVel * dt;
    // the plate rocks a little faster than it pushes back, and rings down
    const wr = 9 / Math.sqrt(sel.size);
    p.rockVel += (-wr * wr * p.rock - 3.2 * p.rockVel) * dt;
    p.rock += p.rockVel * dt;
    p.shake = Math.max(0, p.shake - dt * 3.5);
    if (p.shake > 0) {
      const tt = now / 1000;
      p.shakeX = Math.sin(tt * 61 + p.shakeSeed) * p.shake;
      p.shakeY = Math.cos(tt * 47 + p.shakeSeed * 2) * p.shake;
    } else p.shakeX = p.shakeY = 0;
    p.flash = Math.max(0, p.flash - dt * 2.2);
    p.ripples = p.ripples.filter((r) => now - r.at < 2200 / (0.6 + r.strength));
    p.sparks = p.sparks.filter((s) => now - s.at < s.life);
    p.glints = p.glints.filter((s) => now - s.at < s.life);
    for (const s of p.sparks) {
      s.vy += 3.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    const geo = layout(sel.size, size);
    for (const id in malletsRef.current) {
      const m = malletsRef.current[id];
      m.recoil = Math.max(0, m.recoil - dt * 6);
      if (now - m.at > 4000) {
        delete malletsRef.current[id];
        continue;
      }
      if (m.source === "body") {
        // rest beside the gong on its side, cock back with the arm, fly to
        // the centre on a hit and ease back
        const side = m.side || 1;
        const rx = geo.cx + side * Math.min(geo.R * 1.3, size.width * 0.47 - geo.m * 0.06);
        const ry = geo.cy + geo.R * 0.25;
        const dx = geo.cx - rx, dy = geo.cy - ry;
        const len = Math.hypot(dx, dy) || 1;
        m.hit = Math.max(0, m.hit - dt * (1000 / HIT_MS));
        const k = m.hit * m.hit;
        const cock = (m.cock || 0) * (1 - k) * COCK_R * geo.R;
        const nx = rx + dx * k - (dx / len) * cock;
        const ny = ry + dy * k - (dy / len) * cock;
        if (m.x || m.y) {
          m.vx = m.vx + ((nx - m.x) / dt - m.vx) * 0.5;
          m.vy = m.vy + ((ny - m.y) / dt - m.vy) * 0.5;
        }
        m.x = nx;
        m.y = ny;
      }
      // a short trail of where the head has been, for the swoosh
      if (!m.trail) m.trail = [];
      const lastT = m.trail[m.trail.length - 1];
      if (!lastT || Math.hypot(lastT.x - m.x, lastT.y - m.y) > 1.5) m.trail.push({ x: m.x, y: m.y, at: now });
      while (m.trail.length && now - m.trail[0].at > 160) m.trail.shift();
      if (m.trail.length > 10) m.trail.shift();
    }
    return p;
  }, []);

  return useMemo(
    () => ({ selRef, physRef, malletsRef, sizeRef, gongIndex, malletIndex, cm, hits, best, audioOn, gong: GONGS[gongIndex], mallet: MALLETS[malletIndex], setGong, stepGong, setMallet, stepMallet, setSize, scaleSize, holdMallet: mallet, strike, damp, track, wake }),
    [gongIndex, malletIndex, cm, hits, best, audioOn, setGong, stepGong, setMallet, stepMallet, setSize, scaleSize, mallet, strike, damp, track, wake]
  );
}

// Where things are on a stage of this size, in pixels. The frame (beam,
// posts, floor) is fixed; the gong hangs at a fixed centre and grows with
// `size` inside it, up to just under the beam. m is the stage's shorter
// side, the unit for everything that is not the gong (the mallets, text).
export function layout(size, { width, height }) {
  const m = Math.min(width, height);
  const beamY = height * 0.13;
  const cy = height * 0.54;
  const R = Math.min(m * 0.2 * size, cy - beamY - m * 0.05, width * 0.46);
  return { cx: width / 2, cy, R, beamY, span: Math.min(width * 0.42, height * 0.5), floorY: height * 0.93, m };
}
