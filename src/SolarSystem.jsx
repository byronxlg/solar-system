import { useEffect, useRef } from "react";
import { BODIES, PLANETS, bodyPosition, drawRadius, moonPosition, orbitRadius, pxPerUnit } from "./solar.js";

// The sky: a 2D canvas, top-down on the ecliptic. The camera (useCamera)
// eases toward its goal every frame; this component draws the world through
// it. Labels and the focus card are drawn in screen space in a top layer.
const FONT = '"Avenir Next", "Avenir", "Helvetica Neue", system-ui, sans-serif';
const INK = "#0b0e1a";
const STAR_COUNT = 900;
const BELT_COUNT = 1400;
const BELT = [27.5, 34.5]; // world units, between Mars and Jupiter
const BELT_PERIOD_S = 4.6 * 90; // about 4.6 Earth years

// Seeded pseudo-random so the sky is the same every load.
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const starRand = mulberry(7);
// Stars live in screen space with a touch of parallax, so a close-up of a
// planet still has a sky behind it.
const STARS = Array.from({ length: STAR_COUNT }, () => ({ u: starRand(), v: starRand(), z: 0.3 + starRand() * 0.7, tw: starRand() * Math.PI * 2 }));
const beltRand = mulberry(11);
const BELT_ROCKS = Array.from({ length: BELT_COUNT }, () => {
  const r = BELT[0] + (BELT[1] - BELT[0]) * (0.5 + 0.5 * (beltRand() + beltRand() - 1)); // denser in the middle
  return { r, a: beltRand() * Math.PI * 2, s: 0.08 + beltRand() * 0.12, al: 0.25 + beltRand() * 0.45 };
});

// pointerRef: from useViewGestures; the aiming cursor and its reticle.
export default function SolarSystem({ camera, mode, pointerRef = null, onFrame }) {
  const canvasRef = useRef(null);
  const propsRef = useRef({});
  propsRef.current = { mode, onFrame };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let last = performance.now();
    let frameId;
    // last frame's camera, for the motion streaks
    const prev = { x: 0, y: 0, scale: 1 };
    const motion = { vx: 0, vy: 0, zs: 0 }; // screen px/s and log-zoom/s, smoothed

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
      const cam = camera.track(size, dt, now);
      const clock = camera.clockRef.current;
      const px = pxPerUnit(size, cam.scale);
      // how fast the view is moving, eased so a streak does not flicker
      if (dt > 0) {
        const k = 1 - Math.exp(-dt * 12);
        motion.vx += (((cam.x - prev.x) * px) / dt - motion.vx) * k;
        motion.vy += (((cam.y - prev.y) * px) / dt - motion.vy) * k;
        motion.zs += (Math.log(cam.scale / prev.scale) / dt - motion.zs) * k;
      }
      prev.x = cam.x;
      prev.y = cam.y;
      prev.scale = cam.scale;
      const view = { w, h, px, cam, t: clock.t, loadedAt: clock.loadedAt, now, motion, rate: clock.rate };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSky(ctx, view);
      // world transform: camera centre at the middle of the canvas
      ctx.setTransform(dpr * px, 0, 0, dpr * px, dpr * (w / 2 - cam.x * px), dpr * (h / 2 - cam.y * px));
      drawOrbits(ctx, view);
      drawBelt(ctx, view);
      drawSun(ctx, view);
      const placed = drawPlanets(ctx, view);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLabels(ctx, view, placed);
      drawSpeed(ctx, view);
      if (pointerRef?.current) drawPointer(ctx, view, pointerRef.current, placed);
      propsRef.current.onFrame?.(view);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [camera.track, camera.clockRef, pointerRef]);

  return (
    <div className="sky-wrap">
      <canvas ref={canvasRef} className="sky" />
    </div>
  );
}

// Stars: parallax against the camera (wrapped), a touch of radial parallax
// with zoom so pushing in feels like moving forward, and streaks when the
// view is moving fast, so a flight reads as flying.
const STAR_PAN = 0.02; // star travel per px of camera travel, times depth
const STAR_ZOOM = 0.06; // radial spread per unit of log zoom, times depth
const STREAK_S = 0.5; // how much of a second of motion a streak trails
const STREAK_MAX = 140;
function drawSky(ctx, { w, h, cam, now, px, motion }) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, "#131a33");
  g.addColorStop(0.6, "#0b0e1a");
  g.addColorStop(1, "#05060c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const ox = -cam.x * px * STAR_PAN;
  const oy = -cam.y * px * STAR_PAN;
  const spread = Math.log(cam.scale) * STAR_ZOOM;
  const cx = w / 2, cy = h / 2;
  ctx.lineCap = "round";
  for (const s of STARS) {
    const bx = (((s.u * w + ox * s.z) % w) + w) % w;
    const by = (((s.v * h + oy * s.z) % h) + h) % h;
    const x = bx + (bx - cx) * spread * s.z;
    const y = by + (by - cy) * spread * s.z;
    const tw = 0.7 + 0.3 * Math.sin(now / 900 + s.tw);
    const r = s.z * 1.3;
    const alpha = (0.35 + 0.55 * s.z) * tw;
    // the star's motion on screen this instant, trailed back STREAK_S
    let mx = (-motion.vx * STAR_PAN + (x - cx) * motion.zs * STAR_ZOOM) * s.z * STREAK_S;
    let my = (-motion.vy * STAR_PAN + (y - cy) * motion.zs * STAR_ZOOM) * s.z * STREAK_S;
    const len = Math.hypot(mx, my);
    if (len > 1.5) {
      if (len > STREAK_MAX) {
        mx *= STREAK_MAX / len;
        my *= STREAK_MAX / len;
      }
      ctx.strokeStyle = `rgba(226,232,255,${Math.min(1, alpha * (1 + len / 40))})`;
      ctx.lineWidth = r * 1.6;
      ctx.beginPath();
      ctx.moveTo(x - mx, y - my);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(226,232,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Speed: the edges darken as the view moves fast, like a cockpit window.
function drawSpeed(ctx, { w, h, motion }) {
  const speed = Math.min(1, Math.hypot(motion.vx, motion.vy) / 2500 + Math.abs(motion.zs) / 5);
  if (speed < 0.03) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, "rgba(5,6,12,0)");
  g.addColorStop(1, `rgba(5,6,12,${0.55 * speed})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// The aiming cursor: a soft dot where the finger points, and on a body a
// reticle that fills clockwise over the dwell, then bursts when it fires.
function drawPointer(ctx, { w, h, now, cam, px }, pointer, placed) {
  const { x, y, target, progress, firedAt } = pointer;
  // where the target is on screen this frame
  let tx = null, ty = null, tr = 0;
  if (target !== null) {
    if (target === 0) {
      tx = w / 2 - cam.x * px;
      ty = h / 2 - cam.y * px;
      tr = drawRadius(BODIES[0]) * px;
    } else {
      const p = placed.find((q) => q.index === target);
      if (p) {
        tx = p.sx;
        ty = p.sy;
        tr = p.r;
      }
    }
  }
  ctx.save();
  ctx.lineCap = "round";
  // cursor
  const soft = ctx.createRadialGradient(x, y, 0, x, y, 22);
  soft.addColorStop(0, "rgba(245,197,66,0.35)");
  soft.addColorStop(1, "rgba(245,197,66,0)");
  ctx.fillStyle = soft;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f5c542";
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  const age = now - firedAt;
  if (tx !== null) {
    const R = Math.max(22, tr + 14);
    // four rotating ticks
    ctx.strokeStyle = "rgba(245,197,66,0.8)";
    ctx.lineWidth = 2;
    const rot = now / 1400;
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(a) * (R + 4), ty + Math.sin(a) * (R + 4));
      ctx.lineTo(tx + Math.cos(a) * (R + 12), ty + Math.sin(a) * (R + 12));
      ctx.stroke();
    }
    // the dwell ring filling clockwise from the top
    ctx.strokeStyle = "rgba(245,197,66,0.3)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tx, ty, R, 0, Math.PI * 2);
    ctx.stroke();
    if (progress > 0) {
      ctx.strokeStyle = "#f5c542";
      ctx.beginPath();
      ctx.arc(tx, ty, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
    }
    // name above
    const font = 14;
    ctx.font = `700 ${font}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = progress >= 1 ? `Flying to ${pointer.name}` : pointer.name;
    const tw = ctx.measureText(label).width;
    const ly = ty - R - 22;
    ctx.fillStyle = "#f5c542";
    ctx.beginPath();
    ctx.roundRect(tx - tw / 2 - 9, ly - 11, tw + 18, 22, 11);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(label, tx, ly + 1);
  }
  // burst when it fired
  if (age < 700 && tx !== null) {
    const k = age / 700;
    ctx.strokeStyle = `rgba(245,197,66,${(1 - k) * 0.8})`;
    ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(tx, ty, Math.max(22, tr + 14) + k * 90, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOrbits(ctx, { px }) {
  ctx.lineWidth = 1 / px;
  for (const b of PLANETS) {
    ctx.strokeStyle = "rgba(180,196,240,0.22)";
    ctx.beginPath();
    ctx.arc(0, 0, orbitRadius(b), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBelt(ctx, { t, px }) {
  const spin = (2 * Math.PI * t) / BELT_PERIOD_S;
  // rocks are specks at any zoom: between half a pixel and 1.5 px on screen
  const minR = 0.5 / px;
  const maxR = 1.5 / px;
  for (const k of BELT_ROCKS) {
    const a = k.a - spin;
    ctx.fillStyle = `rgba(190,180,170,${k.al})`;
    ctx.beginPath();
    ctx.arc(k.r * Math.cos(a), k.r * Math.sin(a), Math.min(maxR, Math.max(minR, k.s)), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSun(ctx, { now, cam }) {
  const sun = BODIES[0];
  const r = drawRadius(sun);
  const breathe = 1 + 0.03 * Math.sin(now / 700);
  // wide, faint light that only shows once zoomed in, so a close-up of an
  // inner planet is lit from the Sun's side without the overview drowning
  // Mercury in glow
  const wide = Math.min(1, Math.max(0, (cam.scale - 1.6) / 2.5));
  if (wide > 0) {
    const far = ctx.createRadialGradient(0, 0, r, 0, 0, r * 6);
    far.addColorStop(0, `rgba(255,200,120,${0.14 * wide})`);
    far.addColorStop(0.45, `rgba(255,170,80,${0.04 * wide})`);
    far.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = far;
    ctx.beginPath();
    ctx.arc(0, 0, r * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  const glow = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 2.1 * breathe);
  glow.addColorStop(0, "rgba(255,214,120,0.6)");
  glow.addColorStop(0.4, "rgba(255,170,70,0.2)");
  glow.addColorStop(1, "rgba(255,150,60,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.1 * breathe, 0, Math.PI * 2);
  ctx.fill();
  const disc = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
  disc.addColorStop(0, "#fff6d5");
  disc.addColorStop(0.6, "#ffd166");
  disc.addColorStop(1, "#f29a3a");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
}

// Returns screen positions for the label layer.
function drawPlanets(ctx, view) {
  const { t, loadedAt, px, cam, w, h } = view;
  const placed = [];
  const toScreen = (p) => ({ x: w / 2 + (p.x - cam.x) * px, y: h / 2 + (p.y - cam.y) * px });
  for (let i = 1; i < BODIES.length; i++) {
    const b = BODIES[i];
    const p = bodyPosition(b, t, loadedAt);
    const r = drawRadius(b);
    const sp = toScreen(p);
    const sysR = r * 8 * px;
    if (sp.x < -sysR || sp.x > w + sysR || sp.y < -sysR || sp.y > h + sysR) continue; // off screen
    ctx.save();
    ctx.translate(p.x, p.y);
    const lit = Math.atan2(-p.y, -p.x); // direction to the Sun
    if (b.rings) drawRings(ctx, b, r, lit, "back");
    drawPlanetDisc(ctx, b, r, lit, px);
    if (b.rings) drawRings(ctx, b, r, lit, "front");
    // moons: orbits only once close enough for them to read
    const moons = [];
    if (b.moons && r * px > 14) {
      b.moons.forEach((m, k) => {
        const mp = moonPosition(b, m, t, k);
        if (r * px > 24) {
          ctx.strokeStyle = "rgba(180,196,240,0.16)";
          ctx.lineWidth = 1 / px;
          ctx.beginPath();
          ctx.arc(0, 0, m.orbit * r, 0, Math.PI * 2);
          ctx.stroke();
        }
        const mr = Math.max(m.r * r, 1.2 / px);
        const mg = ctx.createRadialGradient(mp.x + Math.cos(lit) * mr * 0.4, mp.y + Math.sin(lit) * mr * 0.4, mr * 0.1, mp.x, mp.y, mr);
        mg.addColorStop(0, lighten(m.color, 0.35));
        mg.addColorStop(0.7, m.color);
        mg.addColorStop(1, darken(m.color, 0.55));
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(mp.x, mp.y, mr, 0, Math.PI * 2);
        ctx.fill();
        moons.push({ name: m.name, sx: w / 2 + (p.x + mp.x - cam.x) * px, sy: h / 2 + (p.y + mp.y - cam.y) * px, r: mr * px });
      });
    }
    ctx.restore();
    placed.push({ body: b, index: i, sx: sp.x, sy: sp.y, r: r * px, moons });
  }
  return placed;
}

function drawPlanetDisc(ctx, b, r, lit, px) {
  // lit side toward the Sun, terminator on the far side
  const g = ctx.createRadialGradient(Math.cos(lit) * r * 0.45, Math.sin(lit) * r * 0.45, r * 0.05, 0, 0, r * 1.05);
  g.addColorStop(0, lighten(b.color, 0.42));
  g.addColorStop(0.55, b.color);
  g.addColorStop(0.9, darken(b.color, 0.5));
  g.addColorStop(1, darken(b.color, 0.75));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // bands on the gas giants, only when big enough to matter
  if ((b.key === "jupiter" || b.key === "saturn") && r * px > 14) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(-0.25);
    const bands = b.key === "jupiter" ? [[-0.55, 0.1, 0.16], [-0.25, 0.12, 0.1], [0.05, 0.16, 0.18], [0.4, 0.1, 0.12], [0.65, 0.08, 0.1]] : [[-0.5, 0.12, 0.09], [-0.1, 0.18, 0.08], [0.35, 0.14, 0.1]];
    for (const [y, hgt, al] of bands) {
      ctx.fillStyle = `rgba(90,60,40,${al})`;
      ctx.fillRect(-r, y * r - (hgt * r) / 2, r * 2, hgt * r);
    }
    if (b.key === "jupiter") {
      ctx.fillStyle = "rgba(200,90,60,0.55)";
      ctx.beginPath();
      ctx.ellipse(r * 0.35, r * 0.22, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // re-apply the shading over the bands
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  if (b.key === "earth" && r * px > 14) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(96,168,96,0.85)";
    for (const [x, y, rx, ry, rot] of [[-0.35, -0.2, 0.32, 0.22, 0.4], [0.2, 0.35, 0.28, 0.2, -0.5], [0.45, -0.4, 0.2, 0.28, 0.2], [-0.1, 0.55, 0.14, 0.1, 0]]) {
      ctx.beginPath();
      ctx.ellipse(x * r, y * r, rx * r, ry * r, rot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    for (const [x, y, rx, ry, rot] of [[0.1, -0.6, 0.5, 0.08, 0.3], [-0.5, 0.3, 0.3, 0.07, -0.4], [0.5, 0.1, 0.3, 0.06, 0.8]]) {
      ctx.beginPath();
      ctx.ellipse(x * r, y * r, rx * r, ry * r, rot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
}

// Rings as a tilted ellipse: the half behind the planet is drawn before the
// disc, the half in front after it.
function drawRings(ctx, b, r, lit, half) {
  const [inner, outer] = b.rings;
  const tilt = 0.42;
  ctx.save();
  ctx.rotate(b.key === "uranus" ? 1.3 : -0.35);
  ctx.beginPath();
  if (half === "back") ctx.rect(-outer * r * 1.1, -outer * r * 1.1, outer * r * 2.2, outer * r * 1.1);
  else ctx.rect(-outer * r * 1.1, 0, outer * r * 2.2, outer * r * 1.1);
  ctx.clip();
  const steps = b.key === "saturn" ? 5 : 2;
  for (let i = 0; i < steps; i++) {
    const f0 = inner + ((outer - inner) * i) / steps;
    const f1 = inner + ((outer - inner) * (i + 1)) / steps;
    const al = b.key === "saturn" ? [0.55, 0.35, 0.7, 0.25, 0.5][i] : 0.35;
    ctx.fillStyle = b.key === "saturn" ? `rgba(226,205,160,${al})` : `rgba(170,210,215,${al})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, f1 * r, f1 * r * tilt, 0, 0, Math.PI * 2);
    ctx.ellipse(0, 0, f0 * r, f0 * r * tilt, 0, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
  }
  ctx.restore();
}

// Screen-space labels: planet names beside their discs, moon names once
// zoomed in. Never scaled with the world, so they stay readable.
function drawLabels(ctx, { w, h, px, cam }, placed) {
  const font = 13;
  ctx.font = `600 ${font}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const taken = [];
  // the Sun's disc counts as taken so Mercury's label does not sit on it
  const sunR = drawRadius(BODIES[0]) * px * 1.15;
  taken.push({ x: w / 2 - cam.x * px - sunR, y: h / 2 - cam.y * px - sunR, w: sunR * 2, h: sunR * 2 });
  const fits = (x, y, tw) => !taken.some((b) => x < b.x + b.w && x + tw > b.x && y < b.y + (b.h ?? font) && y + font > b.y);
  for (const p of placed) {
    const tw = ctx.measureText(p.body.name).width;
    const gap = Math.max(8, p.r + 6);
    // try right, then below, then left, then above
    const spots = [
      [p.sx + gap, p.sy],
      [p.sx - tw / 2, p.sy + gap + font * 0.6],
      [p.sx - gap - tw, p.sy],
      [p.sx - tw / 2, p.sy - gap - font * 0.6],
    ];
    const spot = spots.find(([x, y]) => x >= 4 && x + tw <= w - 4 && y >= 4 && y <= h - 4 && fits(x, y - font / 2, tw)) || spots[0];
    const [x, y] = spot;
    taken.push({ x, y: y - font / 2, w: tw });
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.lineJoin = "round";
    ctx.strokeText(p.body.name, x, y);
    ctx.fillStyle = "rgba(236,240,255,0.92)";
    ctx.fillText(p.body.name, x, y);
    if (p.r > 18) {
      ctx.font = `500 ${font - 2}px ${FONT}`;
      for (const m of p.moons) {
        const mx = m.sx + Math.max(5, m.r + 4);
        const my = m.sy;
        ctx.strokeText(m.name, mx, my);
        ctx.fillStyle = "rgba(200,208,235,0.85)";
        ctx.fillText(m.name, mx, my);
      }
      ctx.font = `600 ${font}px ${FONT}`;
    }
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lighten(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`;
}
function darken(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r * (1 - k))},${Math.round(g * (1 - k))},${Math.round(b * (1 - k))})`;
}
