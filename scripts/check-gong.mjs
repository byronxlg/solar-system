// Headless check of the gong. Start a dev server first
// (`npx vite --port 5174 --strictPort`), then
// `npm i --no-save playwright && node scripts/check-gong.mjs`.
// Opens the page with ?nomodels and Chromium's fake camera, so the real kiosk
// pipeline runs on synthesised hands and bodies (window.__fake and
// window.__fakeBody, see src/devFlags.js).
// Screenshots go to $OUT (default: the OS temp dir). Exit code 1 on any failure.
import os from "node:os";
import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:5174/solar-system/gong/?nomodels";
const OUT = process.env.OUT || os.tmpdir();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ["camera"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.__gong && window.__kiosk);
await page.waitForFunction(() => !document.querySelector(".kiosk .loading"), null, { timeout: 10000 });
await sleep(400);
check("fake camera up", !(await page.$(".camera-error")));

const fake = (hands) => page.evaluate((h) => { window.__fake = h; }, hands);
const ev = (fn) => page.evaluate(fn);
const state = () => ev(() => window.__gong.state());

// A. Wake the audio with a click on the gong, which is also a strike
{
  const lay = await ev(() => window.__gong.layout());
  check("wake prompt shown before any click", !!(await page.$(".wake")));
  await page.mouse.click(lay.width / 2, lay.height * 0.54);
  await sleep(300);
  const s = await state();
  check("click wakes audio", s.audio === true, `audio=${s.audio}`);
  check("click strikes the gong", s.hits === 1 && s.lastHit?.source === "mouse", `hits=${s.hits} source=${s.lastHit?.source}`);
  check("a voice is ringing", s.ringing >= 1, `ringing=${s.ringing}`);
  check("wake prompt gone", !(await page.$(".wake")));
  check("hit lands near the centre", s.lastHit.r < 0.1, `r=${s.lastHit.r.toFixed(2)}`);
  await sleep(150);
  await page.screenshot({ path: `${OUT}/g1-click.png` });
  // a click off the gong is a miss
  await page.mouse.click(40, 40);
  await sleep(100);
  check("click off the gong misses", (await state()).hits === 1);
}

// A2. The sound is real: the output level rises after a hit, is louder for
// a harder hit, sits well under clipping, and a damp kills it
{
  const lay = await ev(() => window.__gong.layout());
  await ev(() => window.__gong.damp());
  await sleep(1500); // the hall's tail
  const quiet = await ev(() => window.__gong.level());
  // loudest level and loudest sample over the first half second of a hit
  const loudest = async (strength) => {
    await page.evaluate(([l, s]) => window.__gong.strike(l.width / 2 + 10, l.height * 0.54, s), [lay, strength]);
    let top = 0, pk = 0;
    for (let i = 0; i < 20; i++) {
      await sleep(25);
      const [lv, p] = await ev(() => [window.__gong.level(), window.__gong.peak()]);
      top = Math.max(top, lv);
      pk = Math.max(pk, p);
    }
    await ev(() => window.__gong.damp());
    await sleep(600);
    return [top, pk];
  };
  const [soft] = await loudest(0.25);
  const [hard, hardPeak] = await loudest(1);
  check("silence before a hit", quiet < 0.05, `level=${quiet.toFixed(3)}`);
  check("a hit makes sound", soft > 0.03, `soft level=${soft.toFixed(3)}`);
  check("a harder hit is louder", hard > soft * 1.3, `soft=${soft.toFixed(3)} hard=${hard.toFixed(3)}`);
  check("a hard hit does not clip", hardPeak < 0.99, `peak=${hardPeak.toFixed(3)}`);
  await page.evaluate((l) => window.__gong.strike(l.width / 2, l.height * 0.54, 0.9), lay);
  await sleep(200);
  const ringing = await ev(() => window.__gong.level());
  await ev(() => window.__gong.damp());
  await sleep(400);
  const damped = await ev(() => window.__gong.level());
  check("a damp silences it", ringing > 0.03 && damped < ringing * 0.25, `ringing=${ringing.toFixed(3)} damped=${damped.toFixed(3)}`);
  // every gong with the softest and hardest mallet stays under clipping at full strength, two hits stacked
  let worst = 0;
  const nGongs = await ev(() => window.__gong.counts().gongs);
  for (let g = 0; g < nGongs; g++) {
    for (const mm of [1, 4]) {
      await page.evaluate(([g, mm]) => { window.__gong.setGong(g); window.__gong.setMallet(mm); }, [g, mm]);
      await sleep(30);
      await page.evaluate((l) => { window.__gong.strike(l.width / 2, l.height * 0.54, 1); window.__gong.strike(l.width / 2 + l.width * 0.1, l.height * 0.54, 1); }, lay);
      for (let i = 0; i < 12; i++) {
        await sleep(25);
        worst = Math.max(worst, await ev(() => window.__gong.peak()));
      }
      await ev(() => window.__gong.damp());
      await sleep(300);
    }
  }
  check("no gong clips with two full hits stacked", worst < 0.99, `worst peak=${worst.toFixed(3)}`);
  await ev(() => { window.__gong.setGong(0); window.__gong.setMallet(0); });
  await sleep(200);
}

// B. An arm strokes: the wrist runs straight and fast, elbow and all, and
// the mallet on that side strikes the centre. Where the hand is does not
// matter, and less than a real stroke (a flick, a slow reach, a wander)
// does nothing. Fake bodies are raw video coords (mirrored on screen): the
// person's right wrist hangs on the left of the raw frame. The stub's
// world coordinates make the shoulders 0.4 m apart, so with size 0.3 a
// frame width is 1.33 m.
const body = (right = null, left = null) => page.evaluate((b) => { window.__fakeBody = b; }, { x: 0.5, y: 0.4, size: 0.3, right, left });
const nobody = () => page.evaluate(() => { window.__fakeBody = null; });
const HANG_R = { x: 0.32, y: 0.76, z: 0 };
const HANG_L = { x: 0.68, y: 0.76, z: 0 };
// the right arm driven up across the body (0.46 m in about 200 ms), then held
const STROKE = [[0.32, 0.76], [0.36, 0.68], [0.42, 0.56], [0.49, 0.46], [0.54, 0.4], [0.54, 0.4], [0.54, 0.4], [0.54, 0.4], [0.54, 0.4]];
const play = async (frames, left = HANG_L, gap = 33) => {
  for (const [x, y, z = 0] of frames) {
    await body({ x, y, z }, left);
    await sleep(gap);
  }
};
{
  const before = (await state()).hits;
  await body(HANG_R, HANG_L);
  await sleep(300);
  const ms0 = await ev(() => window.__gong.mallets());
  const geo0 = await ev(() => window.__gong.geo());
  check("a body in view holds one mallet", ms0.mallet?.source === "body" && Object.values(ms0).filter((m) => m.source === "body").length === 1, JSON.stringify(Object.keys(ms0)));
  check("the mallet rests beside the gong", ms0.mallet.x > geo0.cx + geo0.R && ms0.mallet.side === 1, `x=${ms0.mallet.x?.toFixed(0)} rim=${(geo0.cx + geo0.R).toFixed(0)}`);
  check("a still body does not strike", (await state()).hits === before);
  await page.screenshot({ path: `${OUT}/g2a-body.png` });
  await play(STROKE);
  // catch the mallet mid-swing: it flies in from its rest with a trail behind it
  let flight = null;
  for (let i = 0; i < 12 && !flight; i++) {
    const m = await ev(() => window.__gong.mallets().mallet);
    if (m && m.hit > 0) flight = m;
    else await sleep(16);
  }
  check("the mallet swings in on the hit", !!flight && flight.x < geo0.cx + geo0.R && flight.trail >= 3, flight ? `x=${flight.x.toFixed(0)} hit=${flight.hit.toFixed(2)} trail=${flight.trail}` : "no flight seen");
  await sleep(250);
  const s = await state();
  const sw = await ev(() => window.__gong.swings());
  check("a stroke strikes the gong", s.hits === before + 1 && s.lastHit?.source === "body", `hits=${s.hits} source=${s.lastHit?.source} peak=${sw.Right?.peak?.toFixed(2)} travel=${sw.Right?.travel?.toFixed(2)}`);
  check("the hit lands on the centre", s.lastHit && s.lastHit.r < 0.12, `r=${s.lastHit?.r?.toFixed(2)}`);
  const hud = await ev(() => [...document.querySelectorAll(".sky-hud .pill")].map((p) => p.textContent));
  check("hud says hit", /Hit \d+%/.test(hud[1]), hud[1]);
  await page.screenshot({ path: `${OUT}/g2-swing.png` });
  // a still arm does not keep hitting
  await sleep(600);
  check("a still arm does not strike again", (await state()).hits === before + 1);
  // a slow drift does not strike
  await play([[0.54, 0.4], [0.55, 0.4], [0.56, 0.4], [0.57, 0.4], [0.58, 0.4], [0.59, 0.4]], HANG_L, 60);
  await sleep(200);
  check("a slow drift does not strike", (await state()).hits === before + 1, `hits=${(await state()).hits}`);
  // a fast flick of the wrist (0.13 m back and forth) is not a stroke
  await play([[0.59, 0.4], [0.64, 0.4], [0.69, 0.4], [0.64, 0.4], [0.59, 0.4], [0.64, 0.4], [0.69, 0.4], [0.64, 0.4], [0.59, 0.4], [0.59, 0.4], [0.59, 0.4]]);
  await sleep(250);
  check("a wrist flick does not strike", (await state()).hits === before + 1, `hits=${(await state()).hits}`);
  // a big but slow reach (0.5 m over 0.8 s) is not a stroke either
  await play([[0.59, 0.4], [0.55, 0.48], [0.5, 0.56], [0.45, 0.64], [0.4, 0.72], [0.35, 0.78], [0.32, 0.8], [0.32, 0.8], [0.32, 0.8]], HANG_L, 110);
  await sleep(250);
  check("a slow reach does not strike", (await state()).hits === before + 1, `hits=${(await state()).hits}`);
  // a punch at the camera (the wrist's z coming toward the viewer) is a stroke
  await play([[0.32, 0.8, 0], [0.32, 0.8, -0.06], [0.32, 0.8, -0.16], [0.32, 0.8, -0.27], [0.32, 0.8, -0.36], [0.32, 0.8, -0.4], [0.32, 0.8, -0.4], [0.32, 0.8, -0.4], [0.32, 0.8, -0.4]]);
  await sleep(250);
  check("a punch at the camera strikes", (await state()).hits === before + 2, `hits=${(await state()).hits}`);
  await nobody();
  await sleep(400);
  // both arms driven together are two hits
  const h2 = (await state()).hits;
  const both = [[0.32, 0.76, 0.68, 0.76], [0.36, 0.68, 0.64, 0.68], [0.42, 0.56, 0.58, 0.56], [0.48, 0.46, 0.52, 0.46], [0.5, 0.4, 0.5, 0.4], [0.5, 0.4, 0.5, 0.4], [0.5, 0.4, 0.5, 0.4], [0.5, 0.4, 0.5, 0.4], [0.5, 0.4, 0.5, 0.4]];
  for (const [rx, ry, lx, ly] of both) {
    await body({ x: rx, y: ry, z: 0 }, { x: lx, y: ly, z: 0 });
    await sleep(33);
  }
  await sleep(250);
  const two = await ev(() => ({ s: window.__gong.state(), m: window.__gong.mallets() }));
  check("both arms strike", two.s.hits === h2 + 2, `hits ${h2} -> ${two.s.hits}`);
  const phys = await ev(() => window.__gong.phys());
  check("hits push the plate back and no popup is drawn", Math.abs(phys.tiltVel) + Math.abs(phys.tilt) > 0.01 && phys.popups === undefined, `tilt=${phys.tilt.toFixed(3)}`);
  const hud2 = await ev(() => document.querySelectorAll(".sky-hud .pill")[1].textContent);
  await sleep(800);
  const hud3 = await ev(() => document.querySelectorAll(".sky-hud .pill")[1].textContent);
  check("hud names the mallet once the hit caption clears", hud3 === "Mallet ready", `${hud2} / ${hud3}`);
  await page.screenshot({ path: `${OUT}/g2b-two-arms.png` });
  // hands do nothing in Play: a held palm does not damp, held fingers do not open Adjust
  const lay = await ev(() => window.__gong.layout());
  await page.mouse.click(lay.width / 2, lay.height * 0.54);
  await sleep(100);
  check("ringing before the palm", (await state()).ringing > 0);
  await fake([{ gesture: "Open_Palm", score: 0.8, x: 0.5, y: 0.5, size: 0.2 }]);
  await sleep(900);
  check("a held palm in Play does not damp", (await state()).ringing > 0, `ringing=${(await state()).ringing}`);
  await fake([{ gesture: "Victory", score: 0.9, x: 0.5, y: 0.5, size: 0.2 }]);
  await sleep(900);
  check("held fingers in Play do not open Adjust", (await ev(() => window.__kiosk.mode)) === "play");
  await fake([]);
  // in Adjust an arm does nothing, and the mallets are put down
  await ev(() => window.__kiosk.setMode("adjust"));
  await sleep(150);
  const h3 = (await state()).hits;
  await play(STROKE);
  await sleep(250);
  const adj = await ev(() => ({ s: window.__gong.state(), m: window.__gong.mallets() }));
  check("a stroke in Adjust does not strike", adj.s.hits === h3, `hits ${h3} -> ${adj.s.hits}`);
  check("no body mallets in Adjust", !Object.values(adj.m).some((m) => m.source === "body" && m.at > 0), JSON.stringify(Object.keys(adj.m)));
  // the way out of Play: the person leaves. Nobody at the start of Play does
  // not count; somebody who was there and has been gone for awayMs does.
  await nobody();
  await ev(() => window.__kiosk.setMode("play"));
  const awayMs = await ev(() => window.__kiosk.awayMs);
  await sleep(awayMs + 600);
  check("an empty room stays in Play", (await ev(() => window.__kiosk.mode)) === "play");
  await body(HANG_R, HANG_L);
  await sleep(400);
  await nobody();
  await sleep(awayMs / 2);
  check("a short absence stays in Play", (await ev(() => window.__kiosk.mode)) === "play");
  await sleep(awayMs / 2 + 700);
  check("nobody in view for a few seconds ends Play", (await ev(() => window.__kiosk.mode)) === "adjust");
  await page.screenshot({ path: `${OUT}/g2c-away.png` });
  await ev(() => window.__kiosk.setMode("play"));
  await sleep(200);
}

// C. Pinch resizes the gong, in Adjust only, and the frame stays put
{
  const s0 = (await state()).goalSize;
  const pinch = async () => {
    await fake([{ gesture: "Pointing_Up", score: 0.9, x: 0.4, y: 0.5, size: 0.2 }, { gesture: "Pointing_Up", score: 0.9, x: 0.6, y: 0.5, size: 0.2, hand: "Left" }]);
    await sleep(150);
    await fake([{ gesture: "Pointing_Up", score: 0.9, x: 0.2, y: 0.5, size: 0.2 }, { gesture: "Pointing_Up", score: 0.9, x: 0.8, y: 0.5, size: 0.2, hand: "Left" }]);
    await sleep(600);
  };
  await pinch();
  check("pinch in Play does nothing", Math.abs((await state()).goalSize - s0) < 0.01, `size=${(await state()).goalSize.toFixed(2)} mode=${await ev(() => window.__kiosk.mode)}`);
  await fake([]);
  await sleep(300);
  const g0 = await ev(() => window.__gong.geo());
  await ev(() => window.__kiosk.setMode("adjust"));
  await sleep(200);
  await pinch();
  const s1 = await state();
  check("pinch out in Adjust grows the gong", s1.goalSize > s0 * 1.5, `size ${s0.toFixed(2)} -> ${s1.goalSize.toFixed(2)} (${s1.cm} cm)`);
  const hud = await ev(() => document.querySelectorAll(".sky-hud .pill")[1].textContent);
  check("resize caption", /Resizing: \d+ cm/.test(hud), hud);
  await sleep(600);
  const g1 = await ev(() => window.__gong.geo());
  check("the gong grows, the frame does not", g1.R > g0.R * 1.4 && g1.beamY === g0.beamY && g1.span === g0.span && g1.cy === g0.cy, `R ${g0.R.toFixed(0)} -> ${g1.R.toFixed(0)} beam ${g0.beamY} -> ${g1.beamY}`);
  check("the big gong clears the beam", g1.cy - g1.R > g1.beamY, `top=${(g1.cy - g1.R).toFixed(0)} beam=${g1.beamY.toFixed(0)}`);
  await page.screenshot({ path: `${OUT}/g3-resize.png` });
  await fake([]);
  await sleep(300);
  await ev(() => window.__gong.setSize(0.5));
  await sleep(600);
  await page.screenshot({ path: `${OUT}/g3b-small.png` });
  await ev(() => window.__gong.setSize(1));
  await ev(() => window.__kiosk.setMode("play"));
  await sleep(300);
}

// D. Holds: in Play no gesture does anything; in Adjust a thumb changes the
// gong, two fingers the mallet, a fist is the way back and a palm does
// nothing; a palm damps in the bath
{
  const g0 = (await state()).gong;
  for (const g of ["Thumb_Up", "Victory", "Open_Palm", "Closed_Fist", "Two_Open_Palms"]) await ev((g) => window.__kiosk.gesture(g), g);
  await sleep(100);
  check("no gesture does anything in Play", (await state()).gong === g0 && (await ev(() => window.__kiosk.mode)) === "play");
  check("no card in Play", !(await page.$(".card")));
  await page.keyboard.press("a");
  await sleep(100);
  check("a opens Adjust", (await ev(() => window.__kiosk.mode)) === "adjust");
  await sleep(1600); // past the hold cooldown
  await ev(() => window.__kiosk.gesture("Thumb_Up"));
  await sleep(100);
  const g1 = (await state()).gong;
  check("thumb up: next gong", g1 !== g0, `${g0} -> ${g1}`);
  await ev(() => window.__kiosk.gesture("Thumb_Down"));
  await sleep(100);
  check("thumb down: back", (await state()).gong === g0);
  const m0 = (await state()).mallet;
  await ev(() => window.__kiosk.gesture("Victory"));
  await sleep(100);
  check("victory: next mallet", (await state()).mallet !== m0, `${m0} -> ${(await state()).mallet}`);
  const card = await ev(() => document.querySelector(".card h2")?.textContent);
  check("card names the gong in Adjust", card === "Chau gong", card);
  await page.screenshot({ path: `${OUT}/g3c-adjust.png` });
  await ev(() => window.__kiosk.gesture("Open_Palm"));
  await sleep(100);
  check("palm in Adjust does nothing", (await ev(() => window.__kiosk.mode)) === "adjust");
  await ev(() => window.__kiosk.gesture("Closed_Fist"));
  await sleep(100);
  check("fist: back to Play", (await ev(() => window.__kiosk.mode)) === "play");
  // the real hold path: a fist held still leaves Adjust
  await ev(() => window.__kiosk.setMode("adjust"));
  await sleep(100);
  await fake([{ gesture: "Closed_Fist", score: 0.9, x: 0.5, y: 0.5, size: 0.2 }]);
  await sleep(900);
  await fake([]);
  await sleep(100);
  check("held fist leaves Adjust through the kiosk", (await ev(() => window.__kiosk.mode)) === "play");
  // a palm damps in the bath (Play has no hand controls at all)
  const lay = await ev(() => window.__gong.layout());
  await ev(() => window.__kiosk.setMode("bath"));
  await sleep(100);
  await page.mouse.click(lay.width / 2, lay.height * 0.54);
  await sleep(100);
  check("ringing before damp", (await state()).ringing > 0);
  await ev(() => window.__kiosk.gesture("Open_Palm"));
  await sleep(100);
  check("open palm damps in the bath", (await state()).ringing === 0 && (await ev(() => window.__kiosk.mode)) === "bath", `ringing=${(await state()).ringing}`);
  // the real hold path: a palm held still for the hold time fires it
  await page.mouse.click(lay.width / 2, lay.height * 0.54);
  await sleep(1600); // past the cooldown
  const d0 = await ev(() => window.__gong.phys().damped);
  await fake([{ gesture: "Open_Palm", score: 0.8, x: 0.5, y: 0.5, size: 0.2 }]);
  await sleep(900);
  // the bath keeps striking on its own, so the damp is checked by its timestamp
  check("held palm damps through the kiosk", (await ev(() => window.__gong.phys().damped)) > d0, `damped=${d0} -> ${await ev(() => window.__gong.phys().damped)}`);
  await fake([]);
  await ev(() => window.__kiosk.setMode("play"));
  await sleep(200);
  // every gong and mallet strikes without error
  const counts = await ev(() => window.__gong.counts());
  for (let g = 0; g < counts.gongs; g++) {
    for (let mm = 0; mm < counts.mallets; mm++) {
      await ev(([g, mm]) => { window.__gong.setGong(g); window.__gong.setMallet(mm); }, [g, mm]).catch(() => {});
      await page.evaluate(([g, mm]) => { window.__gong.setGong(g); window.__gong.setMallet(mm); }, [g, mm]);
      await sleep(30);
      await page.evaluate((l) => window.__gong.strike(l.width / 2 + 40, l.height * 0.54, 0.9), lay);
    }
  }
  await sleep(200);
  check("every gong and mallet strikes", (await state()).hits >= counts.gongs * counts.mallets, `hits=${(await state()).hits} of ${counts.gongs}x${counts.mallets}`);
  // every backdrop draws without error
  for (let sc = 0; sc < counts.scenes; sc++) {
    await page.evaluate((sc) => window.__gong.setScene(sc), sc);
    await sleep(120);
    await page.screenshot({ path: `${OUT}/g3d-scene-${sc}.png` });
  }
  await ev(() => window.__gong.setScene(0));
  // and every planet, in space
  await ev(() => window.__gong.setScene(2));
  for (let g = 0; g < counts.gongs; g++) {
    await page.evaluate((g) => window.__gong.setGong(g), g);
    await sleep(120);
    await page.screenshot({ path: `${OUT}/g3e-gong-${g}.png` });
  }
  await ev(() => { window.__gong.setGong(0); window.__gong.setScene(0); });
  await ev(() => { window.__gong.setGong(0); window.__gong.setMallet(0); window.__gong.damp(); });
}

// E. Two palms in Adjust start the bath; it strikes on its own; a palm stops it
{
  await ev(() => window.__kiosk.gesture("Two_Open_Palms"));
  await sleep(100);
  check("two palms in Play do nothing", (await ev(() => window.__kiosk.mode)) === "play");
  await ev(() => window.__kiosk.setMode("adjust"));
  await sleep(100);
  // through the real hold path: two open palms for the hold time
  await fake([{ gesture: "Open_Palm", score: 0.8, x: 0.35, y: 0.5, size: 0.2 }, { gesture: "Open_Palm", score: 0.8, x: 0.65, y: 0.5, size: 0.2, hand: "Left" }]);
  await sleep(900);
  await fake([]);
  await sleep(100);
  check("two held palms in Adjust start the bath", (await ev(() => window.__kiosk.mode)) === "bath");
  // a hand swung back and forth at the gong is not a wave and does not change the mode
  await ev(() => window.__kiosk.setMode("play"));
  await sleep(100);
  for (let pass = 0; pass < 3; pass++) {
    for (const x of pass % 2 ? [0.6, 0.5, 0.4, 0.3, 0.25] : [0.25, 0.3, 0.4, 0.5, 0.6]) {
      await fake([{ gesture: "None", score: 0.5, x, y: 0.5, size: 0.2 }]);
      await sleep(40);
    }
  }
  await sleep(200);
  check("banging back and forth stays in play", (await ev(() => window.__kiosk.mode)) === "play", (await ev(() => window.__kiosk.mode)));
  await fake([]);
  await sleep(100);
  await ev(() => { window.__kiosk.setMode("adjust"); });
  await sleep(50);
  await ev(() => window.__kiosk.gesture("Two_Open_Palms"));
  await sleep(100);
  check("two palms (dev hook) start the bath", (await ev(() => window.__kiosk.mode)) === "bath");
  const h0 = (await state()).hits;
  await sleep(5000);
  const s = await state();
  check("the bath strikes on its own", s.hits >= h0 + 1 && s.lastHit?.source === "bath", `hits ${h0} -> ${s.hits} source=${s.lastHit?.source}`);
  await page.screenshot({ path: `${OUT}/g4-bath.png` });
  const dBath = await ev(() => window.__gong.phys().damped);
  await ev(() => window.__kiosk.gesture("Open_Palm"));
  await sleep(100);
  check("palm in the bath damps and stays", (await ev(() => window.__kiosk.mode)) === "bath" && (await ev(() => window.__gong.phys().damped)) > dBath, `mode=${await ev(() => window.__kiosk.mode)}`);
  await ev(() => window.__kiosk.gesture("Closed_Fist"));
  await sleep(100);
  check("fist stops the bath", (await ev(() => window.__kiosk.mode)) === "play");
}

// F. A drag is a swing: press, sweep fast across the plate, and it strikes
// again where the sweep peaks; a slow drag does not
{
  const lay = await ev(() => window.__gong.layout());
  const y = lay.height * 0.54;
  const h0 = (await state()).hits;
  await page.mouse.move(lay.width * 0.33, y);
  await page.mouse.down();
  await sleep(50);
  check("press strikes", (await state()).hits === h0 + 1, `hits ${h0} -> ${(await state()).hits}`);
  const h1 = (await state()).hits;
  // slow across, then a fast sweep, then stop
  for (let i = 0; i < 6; i++) { await page.mouse.move(lay.width * (0.33 + i * 0.01), y); await sleep(50); }
  const hSlow = (await state()).hits;
  check("a slow drag does not strike", hSlow === h1, `hits ${h1} -> ${hSlow}`);
  // headless pointer events land about 80 ms apart, so the sweep takes big steps
  for (let i = 0; i < 3; i++) { await page.mouse.move(lay.width * (0.39 + i * 0.14), y); }
  await sleep(60);
  await page.mouse.move(lay.width * 0.7, y);
  await sleep(120);
  const hFast = (await state()).hits;
  check("a fast sweep strikes", hFast === hSlow + 1, `hits ${hSlow} -> ${hFast} source=${(await state()).lastHit?.source}`);
  await page.screenshot({ path: `${OUT}/g6-drag.png` });
  await page.mouse.up();
  await sleep(300);
  // a swipe that lifts off before it slows: the hit lands where it left
  const hUp = (await state()).hits;
  await page.mouse.move(lay.width * 0.6, y - 5);
  await page.mouse.down();
  await sleep(700); // the press hit
  // a slow nudge lets the drag re-arm (its speed has to fall first), then the sweep
  for (let i = 1; i <= 3; i++) { await page.mouse.move(lay.width * 0.6 - i, y); await sleep(120); }
  for (let i = 0; i < 3; i++) { await page.mouse.move(lay.width * (0.6 - i * 0.14), y); }
  await page.mouse.up();
  await sleep(200);
  check("a lift mid-sweep still strikes", (await state()).hits === hUp + 2, `hits ${hUp} -> ${(await state()).hits}`);
  const hud = await ev(() => document.querySelectorAll(".sky-hud .pill")[1].textContent);
  check("hud shows the loudest hit", /loudest \d+%/.test(hud), hud);
}

// G. Keys and wheel
{
  const h0 = (await state()).hits;
  await page.keyboard.press("Space");
  await sleep(100);
  check("space strikes", (await state()).hits === h0 + 1);
  const s0 = (await state()).goalSize;
  await page.keyboard.press("+");
  await sleep(50);
  check("+ grows", (await state()).goalSize > s0);
  const gk = (await state()).gong;
  await page.keyboard.press("ArrowRight");
  await sleep(50);
  check("arrow changes the gong from Play", (await state()).gong !== gk);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("a");
  await sleep(50);
  check("a opens Adjust", (await ev(() => window.__kiosk.mode)) === "adjust");
  const sc0 = (await state()).scene;
  await page.keyboard.press("d");
  await sleep(50);
  check("d changes the backdrop", (await state()).scene !== sc0, `${sc0} -> ${(await state()).scene}`);
  const sc1 = (await state()).scene;
  await ev(() => window.__kiosk.gesture("ILoveYou"));
  await sleep(50);
  check("thumb, index and little finger: next backdrop", (await state()).scene !== sc1, `${sc1} -> ${(await state()).scene}`);
  await ev(() => window.__gong.setScene(0));
  await page.keyboard.press("Escape");
  await sleep(50);
  check("Esc goes back to Play", (await ev(() => window.__kiosk.mode)) === "play");
  const lay = await ev(() => window.__gong.layout());
  await page.mouse.move(lay.width / 2, lay.height / 2);
  await page.mouse.wheel(0, 300);
  await sleep(50);
  check("wheel down shrinks", (await state()).goalSize < s0 * 1.12);
  const switcher = await ev(() => [...document.querySelectorAll(".apps a")].map((a) => [a.textContent, a.getAttribute("href")]));
  check("app switcher links home", switcher.some(([t, h]) => t === "Solar system" && h.startsWith("/solar-system/")), JSON.stringify(switcher));
  await ev(() => window.__gong.setSize(1));
  await sleep(500);
  await page.screenshot({ path: `${OUT}/g5-final.png` });
}

check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
