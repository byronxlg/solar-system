// The backdrops: where the gong hangs. Each scene paints the sky and the
// ground behind the frame; the stage draws the gong's halo, the flash of a
// hit and the floor on top of it, so a scene only has to be a place.
// Everything is procedural and seeded, so a scene looks the same every
// load; the slow things (clouds, waves, fireflies, stars) move with `now`.
//
//   key, name, tagline  for the captions
//   floor: [top, bottom] the floor gradient under the frame
//   line   the floor's front edge
//   draw(ctx, view, rand)  paints the backdrop over the whole stage; view is
//          { w, h, now, geo, phys, loud } and rand a seeded random per scene

export const SCENES = [
  {
    key: "hall", name: "Temple hall", tagline: "Warm dark and lamplight",
    floor: ["rgba(40,28,18,0.9)", "rgba(12,8,5,1)"], line: "rgba(255,200,140,0.08)",
    draw(ctx, { w, h, geo, phys }) {
      ctx.fillStyle = "#15100c";
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(geo.cx, geo.cy, geo.R * 0.4, geo.cx, geo.cy, Math.max(w, h) * 0.8);
      g.addColorStop(0, "rgba(120,80,40,0.35)");
      g.addColorStop(0.5, "rgba(60,40,24,0.35)");
      g.addColorStop(1, "rgba(8,6,4,0.9)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  },
  {
    key: "mountain", name: "Mountain top", tagline: "Dawn above the clouds",
    floor: ["#d9e4ee", "#8797ab"], line: "rgba(255,255,255,0.35)",
    draw(ctx, { w, h, now, geo }, rand) {
      const horizon = geo.floorY - h * 0.22;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#152343");
      sky.addColorStop(0.45, "#5470a8");
      sky.addColorStop(0.8, "#d9a3a0");
      sky.addColorStop(1, "#f6c99a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // a few stars still out at the top
      for (const s of rand.stars) {
        const tw = 0.5 + 0.5 * Math.sin(now / 900 + s.p);
        ctx.fillStyle = `rgba(255,255,255,${s.a * tw * (1 - s.y * 2.2)})`;
        ctx.fillRect(s.x * w, s.y * h, 1.5, 1.5);
      }
      // the sun just up, behind the far ridge
      const sx = w * 0.72, sy = horizon - h * 0.02;
      const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.28);
      sun.addColorStop(0, "rgba(255,236,190,0.95)");
      sun.addColorStop(0.12, "rgba(255,200,130,0.7)");
      sun.addColorStop(1, "rgba(255,170,110,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);
      // ridges, far to near
      rand.ridges.forEach((ridge, i) => {
        const base = horizon + i * h * 0.05;
        ctx.fillStyle = ridge.color;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ridge.pts.forEach(([x, y]) => ctx.lineTo(x * w, base - y * h));
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        // snow on the near ridges
        if (i >= 2) {
          ctx.strokeStyle = `rgba(255,255,255,${0.35 - i * 0.05})`;
          ctx.lineWidth = Math.max(1.5, h * 0.004);
          ctx.beginPath();
          ridge.pts.forEach(([x, y], j) => (j ? ctx.lineTo(x * w, base - y * h) : ctx.moveTo(x * w, base - y * h)));
          ctx.stroke();
        }
      });
      // a sea of cloud below the ridges, drifting
      for (const c of rand.clouds) {
        const x = ((c.x + now / c.speed) % 1.3) * w - w * 0.15;
        const y = horizon + h * 0.1 + c.y * h * 0.12;
        const cg = ctx.createRadialGradient(x, y, 0, x, y, c.r * w);
        cg.addColorStop(0, `rgba(255,255,255,${c.a})`);
        cg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(x - c.r * w, y - c.r * w, c.r * w * 2, c.r * w * 2);
      }
    },
    seed(rand) {
      const stars = Array.from({ length: 60 }, () => ({ x: rand(), y: rand() * 0.4, a: 0.3 + rand() * 0.7, p: rand() * 6 }));
      const colors = ["rgba(150,165,200,0.55)", "rgba(105,120,160,0.75)", "#4b5a7f", "#2f3a58"];
      const ridges = colors.map((color, i) => {
        const pts = [];
        let y = 0.1 + rand() * 0.1;
        for (let x = 0; x <= 1.001; x += 0.04) {
          y += (rand() - 0.5) * (0.09 - i * 0.012);
          y = Math.max(0.02, Math.min(0.28 - i * 0.03, y));
          pts.push([x, y]);
        }
        return { color, pts };
      });
      const clouds = Array.from({ length: 9 }, () => ({ x: rand(), y: rand(), r: 0.08 + rand() * 0.12, a: 0.35 + rand() * 0.35, speed: 60000 + rand() * 60000 }));
      return { stars, ridges, clouds };
    },
  },
  {
    key: "space", name: "Deep space", tagline: "Nothing for light years",
    floor: ["#1b1f2b", "#05060a"], line: "rgba(140,170,255,0.25)",
    draw(ctx, { w, h, now, geo }, rand) {
      ctx.fillStyle = "#03040a";
      ctx.fillRect(0, 0, w, h);
      // nebulae
      for (const n of rand.nebulae) {
        const ng = ctx.createRadialGradient(n.x * w, n.y * h, 0, n.x * w, n.y * h, n.r * w);
        ng.addColorStop(0, n.color.replace("A", n.a));
        ng.addColorStop(1, n.color.replace("A", 0));
        ctx.fillStyle = ng;
        ctx.fillRect(0, 0, w, h);
      }
      for (const s of rand.stars) {
        const tw = 0.6 + 0.4 * Math.sin(now / s.t + s.p);
        ctx.fillStyle = `rgba(${s.c},${s.a * tw})`;
        const r = s.r * Math.max(1, w / 900);
        ctx.fillRect(s.x * w - r / 2, s.y * h - r / 2, r, r);
      }
      // a far planet, lit from the side, with a moon crawling round it
      const px = w * 0.16, py = h * 0.24, pr = Math.min(w, h) * 0.06;
      const pg = ctx.createRadialGradient(px - pr * 0.5, py - pr * 0.4, pr * 0.1, px, py, pr);
      pg.addColorStop(0, "#c9b6ff");
      pg.addColorStop(0.6, "#5a4aa8");
      pg.addColorStop(1, "#120d2e");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      const ma = now / 9000;
      ctx.fillStyle = "#d8d3c8";
      ctx.beginPath();
      ctx.arc(px + Math.cos(ma) * pr * 1.8, py + Math.sin(ma) * pr * 0.5, pr * 0.14, 0, Math.PI * 2);
      ctx.fill();
      // the platform's edge glow
      const eg = ctx.createLinearGradient(0, geo.floorY - h * 0.05, 0, geo.floorY);
      eg.addColorStop(0, "rgba(120,150,255,0)");
      eg.addColorStop(1, "rgba(120,150,255,0.12)");
      ctx.fillStyle = eg;
      ctx.fillRect(0, geo.floorY - h * 0.05, w, h * 0.05);
    },
    seed(rand) {
      const stars = Array.from({ length: 260 }, () => ({ x: rand(), y: rand(), r: 0.8 + rand() * 1.8, a: 0.3 + rand() * 0.7, t: 600 + rand() * 1400, p: rand() * 6, c: ["255,255,255", "255,240,220", "200,215,255"][Math.floor(rand() * 3)] }));
      const nebulae = [
        { x: 0.7, y: 0.3, r: 0.35, color: "rgba(120,60,170,A)", a: 0.28 },
        { x: 0.3, y: 0.55, r: 0.3, color: "rgba(40,120,150,A)", a: 0.22 },
        { x: 0.85, y: 0.7, r: 0.25, color: "rgba(170,80,90,A)", a: 0.18 },
      ];
      return { stars, nebulae };
    },
  },
  {
    key: "beach", name: "Beach at dusk", tagline: "The tide going out",
    floor: ["#d9c39a", "#7d6a48"], line: "rgba(255,240,200,0.3)",
    draw(ctx, { w, h, now, geo }, rand) {
      const horizon = geo.floorY - h * 0.26;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#221f4e");
      sky.addColorStop(0.5, "#8a4d6b");
      sky.addColorStop(0.85, "#e07a5a");
      sky.addColorStop(1, "#f7c77e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // the sun half down
      const sx = w * 0.3;
      const sg = ctx.createRadialGradient(sx, horizon, 0, sx, horizon, h * 0.3);
      sg.addColorStop(0, "rgba(255,230,160,1)");
      sg.addColorStop(0.1, "rgba(255,190,110,0.8)");
      sg.addColorStop(1, "rgba(255,150,100,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, horizon);
      // thin clouds catching the light
      for (const c of rand.clouds) {
        ctx.fillStyle = `rgba(255,200,170,${c.a})`;
        ctx.beginPath();
        ctx.ellipse(((c.x + now / 120000) % 1.2) * w - w * 0.1, horizon - c.y * h * 0.3, c.r * w, c.r * w * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // the sea
      const sea = ctx.createLinearGradient(0, horizon, 0, geo.floorY);
      sea.addColorStop(0, "#5a4f8a");
      sea.addColorStop(0.3, "#2f5f8a");
      sea.addColorStop(1, "#7fb2c9");
      ctx.fillStyle = sea;
      ctx.fillRect(0, horizon, w, geo.floorY - horizon);
      // the sun's path on the water, and the swell
      for (const wv of rand.waves) {
        const y = horizon + wv.y * (geo.floorY - horizon);
        const drift = Math.sin(now / wv.t + wv.p) * w * 0.01;
        const near = wv.y;
        ctx.strokeStyle = `rgba(255,230,190,${0.08 + 0.3 * near * (1 - Math.abs(wv.x - 0.3) * 1.6)})`;
        ctx.lineWidth = 1 + near * 2;
        ctx.beginPath();
        ctx.moveTo(wv.x * w - wv.l * w + drift, y);
        ctx.lineTo(wv.x * w + wv.l * w + drift, y);
        ctx.stroke();
      }
      // foam at the edge
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.15 * Math.sin(now / 1800)})`;
      ctx.fillRect(0, geo.floorY - 2, w, 2.5);
    },
    seed(rand) {
      const clouds = Array.from({ length: 6 }, () => ({ x: rand(), y: rand(), r: 0.08 + rand() * 0.15, a: 0.15 + rand() * 0.25 }));
      const waves = Array.from({ length: 90 }, () => ({ x: rand(), y: Math.pow(rand(), 0.7), l: 0.01 + rand() * 0.05, t: 900 + rand() * 1800, p: rand() * 6 }));
      return { clouds, waves };
    },
  },
  {
    key: "forest", name: "Night forest", tagline: "Mist between the trunks",
    floor: ["#1e2a17", "#080c06"], line: "rgba(180,220,140,0.12)",
    draw(ctx, { w, h, now, geo }, rand) {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#050d10");
      sky.addColorStop(0.6, "#0e2226");
      sky.addColorStop(1, "#15301f");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // moonlight through the canopy
      const mx = w * 0.8, my = h * 0.12;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, h * 0.5);
      mg.addColorStop(0, "rgba(220,235,255,0.5)");
      mg.addColorStop(0.08, "rgba(200,220,255,0.25)");
      mg.addColorStop(1, "rgba(200,220,255,0)");
      ctx.fillStyle = mg;
      ctx.fillRect(0, 0, w, h);
      // trunks in layers, mist between them
      rand.layers.forEach((layer, li) => {
        for (const t of layer.trees) {
          const x = t.x * w;
          const tw = t.w * w;
          ctx.fillStyle = layer.color;
          ctx.beginPath();
          ctx.moveTo(x - tw, geo.floorY);
          ctx.lineTo(x - tw * 0.55, -h * 0.05);
          ctx.lineTo(x + tw * 0.55, -h * 0.05);
          ctx.lineTo(x + tw, geo.floorY);
          ctx.closePath();
          ctx.fill();
          // a branch or two
          ctx.strokeStyle = layer.color;
          ctx.lineWidth = tw * 0.35;
          ctx.lineCap = "round";
          for (const b of t.branches) {
            ctx.beginPath();
            ctx.moveTo(x, b.y * h);
            ctx.lineTo(x + b.dx * w, b.y * h - b.dy * h);
            ctx.stroke();
          }
        }
        const my2 = geo.floorY - h * (0.12 + li * 0.1);
        const mist = ctx.createLinearGradient(0, my2 - h * 0.12, 0, my2 + h * 0.12);
        mist.addColorStop(0, "rgba(150,190,170,0)");
        mist.addColorStop(0.5, `rgba(150,190,170,${0.1 + li * 0.05})`);
        mist.addColorStop(1, "rgba(150,190,170,0)");
        ctx.fillStyle = mist;
        ctx.fillRect(0, my2 - h * 0.12, w, h * 0.24);
      });
      // fireflies
      for (const f of rand.flies) {
        const t = now / f.t + f.p;
        const x = (f.x + Math.sin(t) * 0.02) * w;
        const y = (f.y + Math.cos(t * 1.3) * 0.02) * h;
        const glow = Math.max(0, Math.sin(t * 2.1));
        ctx.fillStyle = `rgba(220,255,140,${0.9 * glow})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + glow * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    seed(rand) {
      const colors = ["#0c1a1c", "#0a1512", "#05100b"];
      const layers = colors.map((color, li) => ({
        color,
        trees: Array.from({ length: 5 + li * 3 }, () => ({
          x: rand(), w: (0.012 + rand() * 0.02) * (1 + li * 0.6),
          branches: Array.from({ length: 1 + Math.floor(rand() * 2) }, () => ({ y: 0.2 + rand() * 0.4, dx: (rand() - 0.5) * 0.12, dy: 0.02 + rand() * 0.06 })),
        })),
      }));
      const flies = Array.from({ length: 28 }, () => ({ x: rand(), y: 0.35 + rand() * 0.55, t: 1500 + rand() * 2500, p: rand() * 6 }));
      return { layers, flies };
    },
  },
];

// Seeded pseudo-random so a scene is the same every load.
export function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seeded = SCENES.map((s, i) => (s.seed ? s.seed(mulberry(101 + i)) : null));

// Paint scene `i` over the stage.
export function drawScene(ctx, i, view) {
  const scene = SCENES[i] || SCENES[0];
  scene.draw(ctx, view, seeded[i]);
  return scene;
}
