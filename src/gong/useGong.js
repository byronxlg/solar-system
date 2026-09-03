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
//   phys:  swing (pendulum angle, radians), tilt (pushed back, 0..1),
//          flash, ripples, sparks, hits, lastHit
//   mallet: where the mallet head is on the stage, in pixels, and who is
//          holding it ("hand" | "mouse" | null)

export const SWING_HANG = 1.35; // where the gong hangs from, in radii above the centre

export function useGong() {
  const selRef = useRef({ gong: 0, mallet: 0, size: 1, goalSize: 1 });
  const physRef = useRef({ swing: 0, swingVel: 0, tilt: 0, tiltVel: 0, flash: 0, ripples: [], sparks: [], hits: 0, lastHit: null, damped: -Infinity });
  const malletRef = useRef({ x: 0, y: 0, source: null, at: -Infinity, recoil: 0 });
  const sizeRef = useRef({ width: 800, height: 600 }); // the stage's size, kept by the stage
  const [gongIndex, setGongIndex] = useState(0);
  const [malletIndex, setMalletIndex] = useState(0);
  const [cm, setCm] = useState(diameterCm(GONGS[0], 1));
  const [hits, setHits] = useState(0);
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

  // Strike at stage pixel (x, y) with strength 0..1. Returns the hit
  // { r, angle, strength } or null for a miss.
  const strike = useCallback(({ x, y, strength = 0.7, source = "mouse" }) => {
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
    audio.strike({ gong, mallet, size: sel.size, r: Math.min(1, r), strength: s });
    // physics: a hit off centre swings it, any hit pushes it back
    p.swingVel += (dx / R) * s * 0.9 * (mallet.hardness * 0.4 + 0.6);
    p.tiltVel += s * 2.4;
    p.flash = Math.min(1, p.flash + 0.5 + s * 0.6);
    p.ripples.push({ x: dx / R, y: dy / R, at: now, strength: s });
    if (p.ripples.length > 12) p.ripples.shift();
    if (mallet.hardness > 0.6 && s > 0.45) {
      const count = Math.round((mallet.hardness - 0.5) * s * 30);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (0.6 + Math.random() * 1.4) * s;
        p.sparks.push({ x: dx / R, y: dy / R, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, at: now, life: 350 + Math.random() * 450 });
      }
    }
    malletRef.current.recoil = 1;
    p.hits += 1;
    p.lastHit = { r: Math.min(1, r), angle: Math.atan2(dy, dx), strength: s, at: now, source };
    setHits(p.hits);
    return p.lastHit;
  }, []);

  // A palm on the plate.
  const damp = useCallback(() => {
    audio.damp();
    const p = physRef.current;
    p.damped = performance.now();
    p.tiltVel *= 0.2;
    p.swingVel *= 0.3;
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
    p.flash = Math.max(0, p.flash - dt * 2.2);
    p.ripples = p.ripples.filter((r) => now - r.at < 2200 / (0.6 + r.strength));
    p.sparks = p.sparks.filter((s) => now - s.at < s.life);
    for (const s of p.sparks) {
      s.vy += 3.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    const m = malletRef.current;
    m.recoil = Math.max(0, m.recoil - dt * 6);
    return p;
  }, []);

  return useMemo(
    () => ({ selRef, physRef, malletRef, sizeRef, gongIndex, malletIndex, cm, hits, audioOn, gong: GONGS[gongIndex], mallet: MALLETS[malletIndex], setGong, stepGong, setMallet, stepMallet, setSize, scaleSize, strike, damp, track, wake }),
    [gongIndex, malletIndex, cm, hits, audioOn, setGong, stepGong, setMallet, stepMallet, setSize, scaleSize, strike, damp, track, wake]
  );
}

// Where the gong sits on a stage of this size, in pixels: centre and
// radius. The gong grows with `size` until it fills the stage.
export function layout(size, { width, height }) {
  const base = Math.min(width, height) * 0.26;
  const R = Math.min(base * size, Math.min(width, height) * 0.44);
  return { cx: width / 2, cy: height * 0.54, R };
}
