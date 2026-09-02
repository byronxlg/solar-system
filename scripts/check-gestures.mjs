// Headless check of the gesture controls. Start a dev server first
// (`npx vite --port 5174 --strictPort`), then
// `npm i --no-save playwright && node scripts/check-gestures.mjs`.
// Opens the page with ?nomodels and Chromium's fake camera, so the real kiosk
// pipeline runs on synthesised hands (window.__fake, see src/devFlags.js).
// Screenshots go to $OUT (default: the OS temp dir). Exit code 1 on any failure.
import os from "node:os";
import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:5174/solar-system/?nomodels";
const OUT = process.env.OUT || os.tmpdir();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ["camera"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.__view && window.__kiosk);
await page.waitForFunction(() => !document.querySelector(".kiosk .loading"), null, { timeout: 10000 });
await sleep(400);
const camErr = await page.$(".camera-error");
check("fake camera up", !camErr);

const fake = (hands) => page.evaluate((h) => { window.__fake = h; }, hands);
const ev = (fn) => page.evaluate(fn);
const POINT_GAIN = 1.4;
// A pointing hand whose index tip aims at sky pixel (X, Y). Fake hands are in
// raw video coords; the app mirrors x, and the cursor amplifies travel.
const aimHand = (s, X, Y, size = 0.2) => {
  const tipSkyX = 0.5 + (X / s.width - 0.5) / POINT_GAIN;
  const tipY = 0.5 + (Y / s.height - 0.5) / POINT_GAIN;
  const rawTipX = 1 - tipSkyX;
  return { gesture: "Pointing_Up", score: 0.9, x: rawTipX + 0.3 * size, y: tipY + 0.8 * size, size };
};

// A. Browse: point at Mars and hold
{
  const mars = 4;
  const s = await ev(() => window.__view.screen(4));
  await fake([aimHand(s, s.x, s.y)]);
  await sleep(450);
  const mid = await ev(() => ({ p: window.__view.pointer(), mode: window.__kiosk.mode, hud: document.querySelector(".sky-hud .pill").textContent }));
  check("aiming captures Mars", mid.p?.target === mars, `target=${mid.p?.target} progress=${mid.p?.progress?.toFixed(2)}`);
  check("aiming caption", mid.hud === "Aiming at Mars", mid.hud);
  await page.screenshot({ path: `${OUT}/a1-aim.png` });
  await sleep(700);
  const after = await ev(() => ({ f: window.__view.focused(), p: window.__view.pointer(), hud: document.querySelector(".sky-hud .pill").textContent }));
  check("dwell flies to Mars", after.f === mars, `focused=${after.f} hud=${after.hud}`);
  await sleep(250);
  await page.screenshot({ path: `${OUT}/a2-flying.png` });
  await fake([]);
  await sleep(300);
  const cleared = await ev(() => window.__view.pointer());
  check("pointer clears when the hand drops", cleared === null);
  const card = await page.$(".card h2");
  check("Mars card shown", card && (await card.textContent()) === "Mars");
}

// B. Navigate: open palm joystick
{
  await ev(() => { window.__kiosk.setMode("navigate"); window.__view.reset(); });
  await sleep(600);
  const g0 = await ev(() => window.__view.goal());
  await fake([{ gesture: "Open_Palm", score: 0.8, x: 0.5, y: 0.5, size: 0.22 }]);
  await sleep(300);
  const still = await ev(() => window.__view.goal());
  check("palm at origin holds still", Math.abs(still.x - g0.x) < 0.01 && Math.abs(still.y - g0.y) < 0.01, `dx=${(still.x - g0.x).toFixed(3)}`);
  // move the hand to the right in raw video coords: mirrored, that is to the left on screen
  await fake([{ gesture: "Open_Palm", score: 0.8, x: 0.72, y: 0.5, size: 0.22 }]);
  await sleep(900);
  const moved = await ev(() => ({ g: window.__view.goal(), o: window.__view.overlay(), hud: document.querySelector(".sky-hud .pill").textContent }));
  check("palm deflection flies", moved.g.x < g0.x - 5, `goal.x=${moved.g.x.toFixed(1)} hud=${moved.hud}`);
  check("fly overlay present", !!moved.o.fly, JSON.stringify(moved.o.fly));
  await page.screenshot({ path: `${OUT}/b1-fly.png` });
  // bring the hand closer: bigger palm
  await fake([{ gesture: "Open_Palm", score: 0.8, x: 0.5, y: 0.5, size: 0.22 }]);
  await sleep(200);
  const s0 = (await ev(() => window.__view.goal())).scale;
  await fake([{ gesture: "Open_Palm", score: 0.8, x: 0.5, y: 0.5, size: 0.36 }]);
  await sleep(900);
  const s1 = (await ev(() => window.__view.goal())).scale;
  check("closer palm pushes in", s1 > s0 * 1.4, `scale ${s0.toFixed(2)} -> ${s1.toFixed(2)}`);
  await page.screenshot({ path: `${OUT}/b2-push.png` });
  await fake([{ gesture: "Open_Palm", score: 0.8, x: 0.5, y: 0.5, size: 0.14 }]);
  await sleep(900);
  const s2 = (await ev(() => window.__view.goal())).scale;
  check("further palm pulls out", s2 < s1 * 0.7, `scale ${s1.toFixed(2)} -> ${s2.toFixed(2)}`);
  await fake([]);
  await sleep(200);
}

// C. Navigate: time dial
{
  await fake([{ gesture: "Victory", score: 0.9, x: 0.5, y: 0.14, size: 0.2 }]);
  await sleep(900);
  const fast = await ev(() => ({ c: window.__view.clock(), pill: document.querySelectorAll(".sky-hud .pill")[1].textContent }));
  check("hand high runs time fast", fast.c.rate > 10, `rate=${fast.c.rate.toFixed(1)} pill=${fast.pill}`);
  check("time pill", /^Time ×\d+/.test(fast.pill), fast.pill);
  await page.screenshot({ path: `${OUT}/c1-time.png` });
  await fake([{ gesture: "Victory", score: 0.9, x: 0.5, y: 0.9, size: 0.2 }]);
  await sleep(1200);
  const back = await ev(() => ({ c: window.__view.clock(), pill: document.querySelectorAll(".sky-hud .pill")[1].textContent }));
  check("hand low rewinds", back.c.rate < -10, `rate=${back.c.rate.toFixed(1)} pill=${back.pill}`);
  await page.screenshot({ path: `${OUT}/c2-rewind.png` });
  await fake([]);
  await sleep(1500);
  const rest = await ev(() => ({ c: window.__view.clock(), pill: document.querySelectorAll(".sky-hud .pill")[1].textContent }));
  check("time eases back to 1x", Math.abs(rest.c.rate - 1) < 0.1, `rate=${rest.c.rate.toFixed(2)} pill=${rest.pill}`);
}

// D. Navigate: pan and pinch still work, pointing works here too
{
  await ev(() => window.__view.reset());
  await sleep(500);
  const g0 = await ev(() => window.__view.goal());
  await fake([{ gesture: "Closed_Fist", score: 0.9, x: 0.5, y: 0.5, size: 0.2, grab: true }]);
  await sleep(150);
  await fake([{ gesture: "Closed_Fist", score: 0.9, x: 0.35, y: 0.5, size: 0.2, grab: true }]);
  await sleep(500);
  const g1 = await ev(() => window.__view.goal());
  check("grab pans", Math.abs(g1.x - g0.x) > 5, `dx=${(g1.x - g0.x).toFixed(1)}`);
  await fake([]);
  await sleep(200);
  await fake([{ gesture: "Pointing_Up", score: 0.9, x: 0.4, y: 0.5, size: 0.2 }, { gesture: "Pointing_Up", score: 0.9, x: 0.6, y: 0.5, size: 0.2, hand: "Left" }]);
  await sleep(150);
  await fake([{ gesture: "Pointing_Up", score: 0.9, x: 0.2, y: 0.5, size: 0.2 }, { gesture: "Pointing_Up", score: 0.9, x: 0.8, y: 0.5, size: 0.2, hand: "Left" }]);
  await sleep(600);
  const g2 = await ev(() => window.__view.goal());
  check("pinch zooms", g2.scale > g1.scale * 1.5, `scale ${g1.scale.toFixed(2)} -> ${g2.scale.toFixed(2)}`);
  await fake([]);
  await sleep(200);
  await ev(() => window.__view.reset());
  await sleep(600);
  const s = await ev(() => window.__view.screen(6));
  await fake([aimHand(s, s.x, s.y)]);
  await sleep(1300);
  const f = await ev(() => window.__view.focused());
  check("pointing works in navigate (Saturn)", f === 6, `focused=${f}`);
  await fake([]);
}

// E. Streaks during a flight, then fist back to browse
{
  await ev(() => { window.__kiosk.gesture("Closed_Fist"); });
  await sleep(300);
  const mode = await ev(() => window.__kiosk.mode);
  check("fist returns to browse", mode === "browse", mode);
  await ev(() => window.__view.reset());
  await sleep(1200);
  await ev(() => window.__view.focus(8));
  await sleep(160);
  await page.screenshot({ path: `${OUT}/e1-warp.png` });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/e2-neptune.png` });
}

check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
