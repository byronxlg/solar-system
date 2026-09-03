// Headless check of the gong. Start a dev server first
// (`npx vite --port 5174 --strictPort`), then
// `npm i --no-save playwright && node scripts/check-gong.mjs`.
// Opens the page with ?nomodels and Chromium's fake camera, so the real kiosk
// pipeline runs on synthesised hands (window.__fake, see src/devFlags.js).
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
  for (let g = 0; g < 6; g++) {
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

// B. A hand swings at the gong: the mallet follows the palm and the peak of
// the swing strikes. Fake hands are raw video coords (mirrored on screen).
{
  const before = (await state()).hits;
  // hand comes in from the right of the frame (left on screen) and stops on the gong
  const xs = [0.15, 0.18, 0.24, 0.32, 0.4, 0.46, 0.5, 0.5, 0.5, 0.5];
  for (const x of xs) {
    await fake([{ gesture: "None", score: 0.5, x, y: 0.5, size: 0.2 }]);
    await sleep(33);
  }
  await sleep(250);
  const s = await state();
  const ms = await ev(() => window.__gong.mallets());
  check("mallet follows the hand", ms.Right?.source === "hand" && ms.Right.at > 0, JSON.stringify(Object.keys(ms)));
  check("swing strikes the gong", s.hits === before + 1 && s.lastHit?.source === "hand", `hits=${s.hits} source=${s.lastHit?.source}`);
  const hud = await ev(() => [...document.querySelectorAll(".sky-hud .pill")].map((p) => p.textContent));
  check("hud says hit", /Hit \d+%/.test(hud[1]), hud[1]);
  await page.screenshot({ path: `${OUT}/g2-swing.png` });
  // a still hand does not keep hitting
  await sleep(600);
  check("a still hand does not strike again", (await state()).hits === before + 1);
  // a slow drift does not strike
  for (const x of [0.5, 0.51, 0.52, 0.53, 0.54, 0.55]) {
    await fake([{ gesture: "None", score: 0.5, x, y: 0.5, size: 0.2 }]);
    await sleep(60);
  }
  await sleep(200);
  check("a slow drift does not strike", (await state()).hits === before + 1, `hits=${(await state()).hits}`);
  // a hand pushing toward the camera (growing) strikes too
  for (const size of [0.2, 0.22, 0.26, 0.31, 0.36, 0.4, 0.4, 0.4]) {
    await fake([{ gesture: "None", score: 0.5, x: 0.5, y: 0.5, size }]);
    await sleep(33);
  }
  await sleep(250);
  check("pushing at the gong strikes", (await state()).hits === before + 2, `hits=${(await state()).hits}`);
  await fake([]);
  await sleep(200);
  // a thumb-up hand is a hold, not a mallet: moving it does not strike
  for (const x of [0.15, 0.25, 0.35, 0.45, 0.5, 0.5, 0.5]) {
    await fake([{ gesture: "Thumb_Up", score: 0.9, x, y: 0.5, size: 0.2 }]);
    await sleep(33);
  }
  await sleep(200);
  check("a thumb up hand does not strike", (await state()).hits === before + 2);
  await fake([]);
  await sleep(400);
  // two hands are two mallets: both swing in from the sides and both strike
  const h2 = (await state()).hits;
  const steps = [[0.1, 0.9], [0.14, 0.86], [0.2, 0.8], [0.28, 0.72], [0.36, 0.64], [0.42, 0.58], [0.45, 0.55], [0.45, 0.55], [0.45, 0.55]];
  for (const [xr, xl] of steps) {
    await fake([{ gesture: "None", score: 0.5, x: xr, y: 0.5, size: 0.2 }, { gesture: "None", score: 0.5, x: xl, y: 0.5, size: 0.2, hand: "Left" }]);
    await sleep(33);
  }
  await sleep(250);
  const two = await ev(() => ({ s: window.__gong.state(), m: window.__gong.mallets() }));
  check("two hands are two mallets", two.m.Right?.source === "hand" && two.m.Left?.source === "hand", JSON.stringify(Object.keys(two.m)));
  check("both hands strike", two.s.hits === h2 + 2, `hits ${h2} -> ${two.s.hits}`);
  const phys = await ev(() => window.__gong.phys());
  check("hits rock and jolt the plate", Math.abs(phys.rockVel) + Math.abs(phys.rock) > 0.01 && phys.popups.length >= 2, `rock=${phys.rock.toFixed(3)} popups=${phys.popups.length}`);
  const hud2 = await ev(() => document.querySelectorAll(".sky-hud .pill")[1].textContent);
  await sleep(800);
  const hud3 = await ev(() => document.querySelectorAll(".sky-hud .pill")[1].textContent);
  check("hud names two mallets once the hit caption clears", hud3 === "Two mallets over the gong", `${hud2} / ${hud3}`);
  await page.screenshot({ path: `${OUT}/g2b-two-hands.png` });
  await fake([]);
  await sleep(1200);
}

// C. Pinch resizes the gong
{
  const s0 = (await state()).goalSize;
  await fake([{ gesture: "Pointing_Up", score: 0.9, x: 0.4, y: 0.5, size: 0.2 }, { gesture: "Pointing_Up", score: 0.9, x: 0.6, y: 0.5, size: 0.2, hand: "Left" }]);
  await sleep(150);
  await fake([{ gesture: "Pointing_Up", score: 0.9, x: 0.2, y: 0.5, size: 0.2 }, { gesture: "Pointing_Up", score: 0.9, x: 0.8, y: 0.5, size: 0.2, hand: "Left" }]);
  await sleep(600);
  const s1 = await state();
  check("pinch out grows the gong", s1.goalSize > s0 * 1.5, `size ${s0.toFixed(2)} -> ${s1.goalSize.toFixed(2)} (${s1.cm} cm)`);
  const hud = await ev(() => document.querySelectorAll(".sky-hud .pill")[1].textContent);
  check("resize caption", /Resizing: \d+ cm/.test(hud), hud);
  await page.screenshot({ path: `${OUT}/g3-resize.png` });
  await fake([]);
  await sleep(300);
  await ev(() => window.__gong.setSize(1));
  await sleep(300);
}

// D. Holds: thumb up changes the gong, victory the mallet, palm damps
{
  const g0 = (await state()).gong;
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
  const card = await ev(() => document.querySelector(".card h2").textContent);
  check("card names the gong", card === "Chau gong", card);
  const lay = await ev(() => window.__gong.layout());
  await page.mouse.click(lay.width / 2, lay.height * 0.54);
  await sleep(100);
  check("ringing before damp", (await state()).ringing > 0);
  await ev(() => window.__kiosk.gesture("Open_Palm"));
  await sleep(100);
  check("open palm damps", (await state()).ringing === 0, `ringing=${(await state()).ringing}`);
  // the real hold path: a palm held still for the hold time fires it
  await page.mouse.click(lay.width / 2, lay.height * 0.54);
  await sleep(1600); // past the cooldown
  await fake([{ gesture: "Open_Palm", score: 0.8, x: 0.5, y: 0.5, size: 0.2 }]);
  await sleep(900);
  check("held palm damps through the kiosk", (await state()).ringing === 0, `ringing=${(await state()).ringing}`);
  await fake([]);
  await sleep(200);
  // every gong and mallet strikes without error
  for (let g = 0; g < 6; g++) {
    for (let mm = 0; mm < 5; mm++) {
      await ev(([g, mm]) => { window.__gong.setGong(g); window.__gong.setMallet(mm); }, [g, mm]).catch(() => {});
      await page.evaluate(([g, mm]) => { window.__gong.setGong(g); window.__gong.setMallet(mm); }, [g, mm]);
      await sleep(30);
      await page.evaluate((l) => window.__gong.strike(l.width / 2 + 40, l.height * 0.54, 0.9), lay);
    }
  }
  await sleep(200);
  check("every gong and mallet strikes", (await state()).hits >= 30, `hits=${(await state()).hits}`);
  await ev(() => { window.__gong.setGong(0); window.__gong.setMallet(0); window.__gong.damp(); });
}

// E. Two palms start the bath; it strikes on its own; a palm stops it
{
  // through the real hold path: two open palms for the hold time
  await fake([{ gesture: "Open_Palm", score: 0.8, x: 0.35, y: 0.5, size: 0.2 }, { gesture: "Open_Palm", score: 0.8, x: 0.65, y: 0.5, size: 0.2, hand: "Left" }]);
  await sleep(900);
  await fake([]);
  await sleep(100);
  check("two held palms start the bath", (await ev(() => window.__kiosk.mode)) === "bath");
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
  await ev(() => window.__kiosk.gesture("Two_Open_Palms"));
  await sleep(100);
  check("two palms (dev hook) start the bath", (await ev(() => window.__kiosk.mode)) === "bath");
  const h0 = (await state()).hits;
  await sleep(5000);
  const s = await state();
  check("the bath strikes on its own", s.hits >= h0 + 1 && s.lastHit?.source === "bath", `hits ${h0} -> ${s.hits} source=${s.lastHit?.source}`);
  await page.screenshot({ path: `${OUT}/g4-bath.png` });
  await ev(() => window.__kiosk.gesture("Open_Palm"));
  await sleep(100);
  check("palm stops the bath", (await ev(() => window.__kiosk.mode)) === "play");
}

// F. Keys and wheel
{
  const h0 = (await state()).hits;
  await page.keyboard.press("Space");
  await sleep(100);
  check("space strikes", (await state()).hits === h0 + 1);
  const s0 = (await state()).goalSize;
  await page.keyboard.press("+");
  await sleep(50);
  check("+ grows", (await state()).goalSize > s0);
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
