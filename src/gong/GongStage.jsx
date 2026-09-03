import { useEffect, useRef } from "react";
import { GONGS, MALLETS } from "./gongs.js";
import { layout, SWING_HANG } from "./useGong.js";

// The stage: a 2D canvas with the gong hanging in its frame. The gong
// (useGong) keeps the physics; this draws from its refs every frame and
// feeds the mouse and touch in as strikes.
const FONT = '"Avenir Next", "Avenir", "Helvetica Neue", system-ui, sans-serif';

// Seeded pseudo-random so the hammer marks are the same every load.
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Hammer marks per gong: small arcs in loose rings, in unit-radius coords.
const MARKS = GONGS.map((g, gi) => {
  const rand = mulberry(31 + gi);
  const count = Math.round(260 * g.marks);
  return Array.from({ length: count }, () => {
    const rr = 0.12 + Math.sqrt(rand()) * 0.84;
    const a = rand() * Math.PI * 2;
    return { rr, a, len: 0.05 + rand() * 0.07, w: 0.006 + rand() * 0.01, al: 0.08 + rand() * 0.14 };
  });
});

export default function GongStage({ gong, onFrame = null }) {
  const canvasRef = useRef(null);
  const propsRef = useRef({});
  propsRef.current = { onFrame };
  const pointerRef = useRef({ x: 0, y: 0, t: 0, speed: 0, down: false, lastStrike: -Infinity });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let last = performance.now();
    let frameId;
    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const wrap = canvas.parentElement;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const size = { width: w, height: h };
      const phys = gong.track(size, dt, now);
      const sel = gong.selRef.current;
      const theme = GONGS[sel.gong];
      const mallet = MALLETS[sel.mallet];
      const geo = layout(sel.size, size);
      const view = { w, h, now, dt, phys, theme, mallet, geo, sel, gi: sel.gong };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRoom(ctx, view);
      drawFrame(ctx, view);
      drawGong(ctx, view);
      drawSparks(ctx, view);
      drawMallet(ctx, view, gong.malletRef.current);
      propsRef.current.onFrame?.(view);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [gong.track, gong.selRef, gong.malletRef]);

  // Mouse and touch: the pointer holds the mallet when no hand does; a press
  // strikes where it lands, as hard as the pointer was moving.
  function pos(e) {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onMove(e) {
    const p = pos(e);
    const pr = pointerRef.current;
    const now = performance.now();
    const dt = Math.max(1, now - pr.t) / 1000;
    const w = canvasRef.current.clientWidth || 1;
    const v = Math.hypot(p.x - pr.x, p.y - pr.y) / w / dt;
    pr.speed = pr.speed + (v - pr.speed) * 0.5;
    pr.x = p.x;
    pr.y = p.y;
    pr.t = now;
    const m = gong.malletRef.current;
    if (m.source !== "hand" || now - m.at > 300) {
      m.x = p.x;
      m.y = p.y;
      m.source = "mouse";
      m.at = now;
    }
  }
  function onDown(e) {
    gong.wake();
    const p = pos(e);
    const pr = pointerRef.current;
    const now = performance.now();
    if (now - pr.lastStrike < 60) return;
    pr.lastStrike = now;
    // a still click is a medium hit; a flick is harder
    const strength = Math.min(1, 0.55 + pr.speed / 6);
    const m = gong.malletRef.current;
    m.x = p.x;
    m.y = p.y;
    m.source = "mouse";
    m.at = now;
    gong.strike({ x: p.x, y: p.y, strength, source: e.pointerType === "touch" ? "touch" : "mouse" });
    canvasRef.current.setPointerCapture?.(e.pointerId);
  }
  // wheel resizes; a native listener because React's is passive and the
  // page must not scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      gong.scaleSize(Math.exp(-e.deltaY * 0.0015));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [gong]);
  function onLeave() {
    const m = gong.malletRef.current;
    if (m.source === "mouse") m.source = null;
  }

  return (
    <div className="stage-wrap">
      <canvas ref={canvasRef} className="stage" onPointerMove={onMove} onPointerDown={onDown} onPointerLeave={onLeave} />
    </div>
  );
}

// Warm dark hall: a wash of light behind the gong that brightens with the
// hit, a floor line, a vignette.
function drawRoom(ctx, { w, h, phys, theme, geo }) {
  ctx.fillStyle = "#15100c";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(geo.cx, geo.cy, geo.R * 0.4, geo.cx, geo.cy, Math.max(w, h) * 0.8);
  g.addColorStop(0, `rgba(120,80,40,${0.35 + phys.flash * 0.35})`);
  g.addColorStop(0.5, "rgba(60,40,24,0.35)");
  g.addColorStop(1, "rgba(8,6,4,0.9)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // a hint of the gong's colour on the wall behind it
  const tint = ctx.createRadialGradient(geo.cx, geo.cy, geo.R * 0.9, geo.cx, geo.cy, geo.R * 2.2);
  tint.addColorStop(0, hexA(theme.color, 0.16 + phys.flash * 0.25));
  tint.addColorStop(1, hexA(theme.color, 0));
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
  // floor
  const floorY = Math.min(h - 10, geo.cy + geo.R * 1.45);
  const fl = ctx.createLinearGradient(0, floorY, 0, h);
  fl.addColorStop(0, "rgba(40,28,18,0.9)");
  fl.addColorStop(1, "rgba(12,8,5,1)");
  ctx.fillStyle = fl;
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.fillStyle = "rgba(255,200,140,0.08)";
  ctx.fillRect(0, floorY, w, 1.5);
}

// Two posts, a beam with turned ends, and a rope from each end to the gong's
// hooks. The gong swings from the beam, so the ropes lean with it.
function drawFrame(ctx, { w, h, geo, phys }) {
  const { cx, cy, R } = geo;
  const beamY = cy - R * SWING_HANG;
  const span = R * 1.6;
  const postW = Math.max(8, R * 0.08);
  const floorY = Math.min(h - 10, cy + R * 1.45);
  ctx.save();
  // posts
  for (const sx of [-1, 1]) {
    const x = cx + sx * span;
    const pg = ctx.createLinearGradient(x - postW / 2, 0, x + postW / 2, 0);
    pg.addColorStop(0, "#3b2612");
    pg.addColorStop(0.45, "#6d4a26");
    pg.addColorStop(1, "#2b1b0d");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(x - postW / 2, beamY - postW * 1.6, postW, floorY - beamY + postW * 1.6, postW / 3);
    ctx.fill();
    // foot
    ctx.fillStyle = "#2a1a0c";
    ctx.beginPath();
    ctx.roundRect(x - postW * 1.4, floorY - postW * 0.5, postW * 2.8, postW * 0.7, postW / 3);
    ctx.fill();
  }
  // beam
  const bg = ctx.createLinearGradient(0, beamY - postW * 0.7, 0, beamY + postW * 0.7);
  bg.addColorStop(0, "#7a5530");
  bg.addColorStop(0.5, "#4f3418");
  bg.addColorStop(1, "#2b1b0d");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(cx - span - postW * 1.8, beamY - postW * 0.7, span * 2 + postW * 3.6, postW * 1.4, postW * 0.5);
  ctx.fill();
  // ropes: from the beam to the hooks, which sit on the swung gong
  const hookR = R * 0.92;
  const hookA = -Math.PI / 2 + phys.swing;
  for (const sx of [-1, 1]) {
    const ax = cx + sx * R * 0.45;
    const ay = beamY + postW * 0.7;
    const a = hookA + sx * 0.33;
    const hx = cx + Math.cos(hookA) * -R * SWING_HANG * 0 + Math.cos(a) * hookR + Math.sin(phys.swing) * R * SWING_HANG;
    const hy = cy + Math.sin(a) * hookR - (1 - Math.cos(phys.swing)) * R * SWING_HANG;
    ctx.strokeStyle = "#c9a06a";
    ctx.lineWidth = Math.max(2, R * 0.018);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = "rgba(60,35,10,0.6)";
    ctx.lineWidth = Math.max(1, R * 0.006);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(hx, hy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGong(ctx, view) {
  const { geo, phys, theme, now, gi } = view;
  const { cx, cy, R } = geo;
  ctx.save();
  // hang from the beam and swing; a hit pushes it back (a squeeze toward the centre)
  const hang = R * SWING_HANG;
  ctx.translate(cx, cy - hang);
  ctx.rotate(phys.swing);
  ctx.translate(0, hang);
  const squeeze = 1 - 0.07 * Math.max(-1, Math.min(1, phys.tilt));
  ctx.scale(squeeze, 1 - 0.015 * Math.abs(phys.tilt));
  // shadow on the wall
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(R * 0.06, R * 0.1, R * 1.02, R * 1.02, 0, 0, Math.PI * 2);
  ctx.fill();
  // the rim: a turned-back lip, darker
  if (theme.rim) {
    const rim = ctx.createRadialGradient(0, 0, R * 0.9, 0, 0, R);
    rim.addColorStop(0, theme.face[2]);
    rim.addColorStop(0.6, theme.rim);
    rim.addColorStop(1, theme.face[3]);
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
  }
  const faceR = theme.rim ? R * 0.91 : R;
  // the face: lit from top-left, shading toward the rim
  const face = ctx.createRadialGradient(-faceR * 0.35, -faceR * 0.4, faceR * 0.05, 0, 0, faceR);
  face.addColorStop(0, theme.face[0]);
  face.addColorStop(0.4, theme.face[1]);
  face.addColorStop(0.85, theme.face[2]);
  face.addColorStop(1, theme.face[3]);
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, faceR, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, faceR, 0, Math.PI * 2);
  ctx.clip();
  // hammer marks: small arcs around the centre
  ctx.lineCap = "round";
  for (const m of MARKS[gi]) {
    ctx.strokeStyle = `rgba(0,0,0,${m.al})`;
    ctx.lineWidth = Math.max(0.8, m.w * faceR);
    ctx.beginPath();
    ctx.arc(0, 0, m.rr * faceR, m.a, m.a + m.len);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${m.al * 0.6})`;
    ctx.beginPath();
    ctx.arc(0, 0, m.rr * faceR - Math.max(0.8, m.w * faceR), m.a, m.a + m.len);
    ctx.stroke();
  }
  // lacquer rings (chau) or a bright ring (moon)
  if (theme.lacquer) {
    const [a, b] = theme.lacquer;
    ctx.fillStyle = theme.key === "moon" ? "rgba(255,255,255,0.35)" : "rgba(10,8,6,0.78)";
    ctx.beginPath();
    ctx.arc(0, 0, faceR, 0, Math.PI * 2);
    ctx.arc(0, 0, faceR * b, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    if (theme.key !== "moon") {
      ctx.beginPath();
      ctx.arc(0, 0, faceR * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the boss
  if (theme.boss) {
    const br = faceR * theme.boss;
    const bg = ctx.createRadialGradient(-br * 0.35, -br * 0.4, br * 0.05, 0, 0, br);
    bg.addColorStop(0, theme.face[0]);
    bg.addColorStop(0.6, theme.face[1]);
    bg.addColorStop(1, theme.face[3]);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(br * 0.08, br * 0.12, br * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(0, 0, br, 0, Math.PI * 2);
    ctx.fill();
  }
  // ripples from each hit, expanding and fading
  for (const rp of phys.ripples) {
    const age = (now - rp.at) / 1000;
    const life = 2.2 / (0.6 + rp.strength);
    const k = age / life;
    if (k >= 1) continue;
    const rings = 3;
    for (let i = 0; i < rings; i++) {
      const rr = (age * (0.9 + rp.strength * 0.8) - i * 0.12) * faceR;
      if (rr <= 0) continue;
      const alpha = (1 - k) * (0.55 - i * 0.15) * (0.4 + rp.strength * 0.6);
      ctx.strokeStyle = `rgba(255,236,200,${Math.max(0, alpha)})`;
      ctx.lineWidth = Math.max(1, faceR * 0.02 * (1 - k) * (i === 0 ? 1.4 : 1));
      ctx.beginPath();
      ctx.arc(rp.x * faceR, rp.y * faceR, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // the flash of a hit
  if (phys.flash > 0) {
    const last = phys.lastHit;
    const fx = last ? last.r * Math.cos(last.angle) * faceR : 0;
    const fy = last ? last.r * Math.sin(last.angle) * faceR : 0;
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, faceR * (0.5 + phys.flash * 0.6));
    fg.addColorStop(0, `rgba(255,245,220,${0.55 * phys.flash})`);
    fg.addColorStop(1, "rgba(255,245,220,0)");
    ctx.fillStyle = fg;
    ctx.fillRect(-faceR, -faceR, faceR * 2, faceR * 2);
  }
  // a palm on it: the whole face dims for a moment
  const damped = now - phys.damped;
  if (damped < 500) {
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - damped / 500)})`;
    ctx.fillRect(-faceR, -faceR, faceR * 2, faceR * 2);
  }
  // specular sheen that slides with the swing
  const sx = -faceR * 0.4 + Math.sin(phys.swing * 4) * faceR * 0.2;
  const sheen = ctx.createRadialGradient(sx, -faceR * 0.45, 0, sx, -faceR * 0.45, faceR * 0.9);
  sheen.addColorStop(0, "rgba(255,255,255,0.22)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.04)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-faceR, -faceR, faceR * 2, faceR * 2);
  ctx.restore();
  // edge line
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = Math.max(1, R * 0.01);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  // hooks
  for (const s of [-1, 1]) {
    const a = -Math.PI / 2 + s * 0.33;
    ctx.fillStyle = "#e8c27a";
    ctx.beginPath();
    ctx.arc(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, Math.max(3, R * 0.03), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSparks(ctx, { geo, phys, now }) {
  const { cx, cy, R } = geo;
  for (const s of phys.sparks) {
    const k = (now - s.at) / s.life;
    ctx.fillStyle = `rgba(255,${Math.round(220 - 120 * k)},${Math.round(120 - 100 * k)},${1 - k})`;
    ctx.beginPath();
    ctx.arc(cx + s.x * R, cy + s.y * R, Math.max(1, R * 0.012 * (1 - k * 0.5)), 0, Math.PI * 2);
    ctx.fill();
  }
}

// The mallet follows whoever holds it: shaft in from the bottom right, head
// at the hand, a shadow on the plate when it is over the gong, and a recoil
// along the shaft after a hit.
function drawMallet(ctx, { geo, now, mallet, w, h }, m) {
  if (!m.source || now - m.at > 1500) return;
  const { cx, cy, R } = geo;
  const headR = Math.max(10, R * 0.09) * mallet.headR;
  const fade = Math.min(1, (1500 - (now - m.at)) / 300);
  // the shaft comes in from below and to the right of the head
  const dirX = 0.55;
  const dirY = 0.83;
  const len = Math.max(140, R * 1.1);
  const recoil = m.recoil * headR * 1.4;
  const hx = m.x + dirX * recoil;
  const hy = m.y + dirY * recoil;
  ctx.save();
  ctx.globalAlpha = fade;
  // shadow on the gong
  const over = Math.hypot(m.x - cx, m.y - cy) <= R;
  if (over) {
    const dist = Math.min(1, m.recoil * 0.7 + 0.3);
    ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - dist * 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(hx + headR * 0.4 * (1 + dist), hy + headR * 0.6 * (1 + dist), headR * 1.05, headR * 0.75, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = "round";
  const sw = mallet.shape === "rod" ? Math.max(4, headR * 0.5) : Math.max(6, headR * 0.28);
  // shaft with a light edge
  ctx.strokeStyle = shade(mallet.shaft, -0.35);
  ctx.lineWidth = sw + 2;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + dirX * len, hy + dirY * len);
  ctx.stroke();
  ctx.strokeStyle = mallet.shaft;
  ctx.lineWidth = sw;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + dirX * len, hy + dirY * len);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = Math.max(1, sw * 0.25);
  ctx.beginPath();
  ctx.moveTo(hx - sw * 0.25, hy);
  ctx.lineTo(hx + dirX * len - sw * 0.25, hy + dirY * len);
  ctx.stroke();
  // grip
  ctx.strokeStyle = "#1c1410";
  ctx.lineWidth = sw + 3;
  ctx.beginPath();
  ctx.moveTo(hx + dirX * len * 0.72, hy + dirY * len * 0.72);
  ctx.lineTo(hx + dirX * len, hy + dirY * len);
  ctx.stroke();
  // head
  if (mallet.shape === "rod") {
    ctx.fillStyle = mallet.head;
    ctx.beginPath();
    ctx.arc(hx, hy, sw * 0.55, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const hg = ctx.createRadialGradient(hx - headR * 0.35, hy - headR * 0.4, headR * 0.1, hx, hy, headR);
    hg.addColorStop(0, shade(mallet.head, 0.25));
    hg.addColorStop(0.7, mallet.head);
    hg.addColorStop(1, shade(mallet.head, -0.45));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = mallet.headRing;
    ctx.lineWidth = Math.max(1.5, headR * 0.1);
    ctx.beginPath();
    ctx.arc(hx, hy, headR * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexA(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
// k > 0 lightens toward white, k < 0 darkens toward black
function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
