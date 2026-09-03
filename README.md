# solar-system

A solar system you fly through with your hands, and a gong you bang with
them. Vite + React, with hand tracking running locally in the browser
(MediaPipe Gesture Recognizer). No buttons, no server: a static site with
two apps that share one kiosk.

Live: https://byronxlg.github.io/solar-system/ (the sky) and
https://byronxlg.github.io/solar-system/gong/ (the gong). A switcher top-right
of each links to the other.

```sh
npm install
npm run dev
```

Open http://localhost:5173/solar-system/ in Chrome and allow the camera.

Dev: `http://localhost:5173/solar-system/?nomodels` (or `VITE_NO_MODELS=1 npm run dev`)
skips the gesture model so the page is up in a second. The kiosk runs with no
detections and the `window.__view` / `__kiosk` hooks still drive the sky. Set
`window.__fake = [{ gesture: "Open_Palm", x: 0.5, y: 0.5, size: 0.2 }]` and
the stub recognizer synthesises landmarks for those hands, so a headless run
(Playwright with Chromium's `--use-fake-device-for-media-stream`) exercises
the real kiosk pipeline including the overlays. See `src/devFlags.js`.
`scripts/check-gestures.mjs` does exactly that for every control and saves
screenshots; its header says how to run it.

## Layout

- Left: the sky, a 2D canvas looking down on the ecliptic. The Sun, the eight
  planets on their orbits, the asteroid belt, the big moons (the Moon, Phobos
  and Deimos, the Galilean four, Titan, Titania and Oberon, Triton) and
  Saturn's and Uranus's rings. Planets start at their real heliocentric
  longitude for today (mean elements at J2000, circular orbits) and move on
  from there with an Earth year passing every 90 s, so Mercury laps every 22 s
  and Neptune takes four hours. Orbit radii are square-root compressed and
  drawn sizes log-compressed so the inner planets stay readable beside
  Neptune (`src/solar.js` has the data and the maths, pure enough for node).
  Moon periods are square-root compressed too so Io does not blur while the
  Moon still crawls. Stars sit in screen space with a little parallax so a
  close-up still has a sky behind it. Labels are screen-space and never
  overlap. The camera (`src/useCamera.js`) eases toward a goal every frame;
  when a body is focused the goal follows it around its orbit and a card
  bottom-left gives its numbers and one thing worth knowing. Sim time lives
  on the camera too (`clockRef`): a rate of 1 is an Earth year per 90 s, and
  the time dial can run it at up to 30x either way. When the view moves fast
  the stars streak along their motion and the edges darken, so a flight to
  Neptune reads as flying rather than a pan; stars also spread out a little
  as you push in, so zooming feels like moving forward.
- Pointing: one raised index finger is a cursor on the sky (fingertip
  position, amplified so the edge of the camera frame reaches the edge of the
  sky). A body near the cursor gets a reticle; hold on it for about a second
  and the ring fills and you fly there. Works in MAIN VIEW and NAVIGATE.
- Right: the kiosk. One always-on camera, mirrored. A mode banner and a
  colour-coded frame show where you are; the strip under the camera says what
  to do. Hand skeletons are always drawn; recognised gestures get a label,
  zooming stretches a band between the two fingertips, and a grabbing hand
  gets a drag handle. A held gesture fills a pill with what is about to
  happen; the control that fired flashes yellow.
  - MAIN VIEW (blue): point at a planet and hold to fly there; hold a Thumb
    Up to fly to the next body (Sun, then Mercury out to Neptune), Thumb Down
    for the previous one, two Open Palms to enter NAVIGATE, wave a hand (open
    hand swung side to side, tracked in `src/wave.js`) to take the tour, hold
    a Closed Fist to go back to the whole system.
  - NAVIGATE (teal): one Open Palm is a joystick: where it first shows up is
    the centre, move it from there to fly that way (a dead zone, then a smooth
    ramp to full speed), bring it closer to the camera to push in and pull it
    back to pull out (hand size against where it started). Pointing works
    here too. One hand with index finger touching thumb (Grab, detected from
    landmarks) pans the sky, two Pointing_Up fingertips pinching zoom. One
    Victory hand (two fingers) is the time dial: the middle of the frame is
    1x, raise it to run the orbits up to 30x, lower it to slow down and then
    rewind up to 30x; drop the hand and time eases back to 1x. A held Closed
    Fist goes back to MAIN VIEW (the view stays where you left it). Moving
    the sky releases any focused body. Everything continuous goes through a
    One Euro filter (`src/useViewGestures.js`) so a still hand is steady and
    a moving one has no lag.
  - TOUR (amber): nine stops, nine seconds each, from the Sun out to Neptune,
    then back to the overview. Thumb Up skips ahead, Closed Fist stops.

The controls table is in [docs/control-system.md](docs/control-system.md).
Without a camera the arrow keys stand in for thumb up and down, `n` for two
palms, `t` for a wave and `Esc` for a fist (`KEYS` in `src/Controls.jsx`).

## Gong

`/gong/` (`gong/index.html`, `src/gong/`). A gong hangs in a frame on the
left; the kiosk on the right is the same one the sky uses. Any hand that is
not in a hold pose holds the mallet: the head follows the palm (mirrored,
amplified so the edge of the frame reaches the edge of the stage) and a fast
swing over the plate strikes it where the swing peaks. Faster is louder, and
pushing the hand at the camera counts as swinging at the gong. The rim rings
brighter than the centre, a bigger gong rings lower and longer.

- `src/gong/gongs.js`: six gongs (chau, symphonic, wind, Tibetan, iron,
  moon) and five mallets (wool, felt, rubber, wood, steel) as pure data:
  colours, hammer-mark density, fundamental, partial ratios, decay and
  shimmer for a gong; hardness, contact noise and head size for a mallet.
  `strikeSpectrum` turns a hit (where, how hard, which mallet) into
  per-partial gains.
- `src/gong/audio.js`: Web Audio synthesis, no samples. Each strike is a
  bank of detuned sine pairs at the gong's partial ratios with their own
  decays, a filtered noise burst for the mallet's contact, a delayed swell of
  the upper partials (the bloom), a band of noise that swells in behind a
  hard hit and hangs on (the wash), a short low thump under a soft mallet
  hit hard and a metallic ping off a hard head, panned to where on the
  plate the hit landed, all through a synthetic hall and a compressor. An
  analyser on the output gives the stage the level so the halo breathes
  with the sound. The context starts on the first click or key; the page
  says so until it has.
- `src/gong/useGong.js`: selection (gong, mallet, size), physics (pendulum
  swing, push-back, the plate rocking about the axis across the hit, a jolt
  of the whole stage on a hard hit, flash, ripples, glints, sparks, the
  strength popup) and `strike()`, which every source goes through: hands,
  mouse, touch, keys and the bath. One mallet per holder (each hand, the
  mouse), with a short trail for the swoosh. `layout()` says where the gong
  is on the stage.
- `src/gong/useStrikeGestures.js`: hands to mallets and strikes, one mallet
  per hand so two hands play two-handed; two pointed fingers pinching resize
  the gong.
- `src/gong/GongStage.jsx`: the canvas. Room and halo, frame, ropes, the gong
  with its rim, hammer marks, lacquer, boss, ripples, rocking light and
  sheen, a rim of light that rings with the sound, sparks, the mallets,
  the popups.
- Modes: PLAY (bronze) and GONG BATH (indigo), where the gong plays itself
  with slow, soft strikes, every fourth louder, the odd pair or roll, and
  moves on to the next gong and mallet every eighth one. Hold a thumb up or
  down for the next or previous gong, two fingers up for the next mallet, an
  open palm to damp it, two open palms for the bath. Not a wave: swinging at
  the gong twice is a wave.

Without a camera: click or tap the gong, scroll to resize; Space strikes,
the arrow keys change the gong, `s` the mallet, `m` damps, `b` starts the
bath, `+` and `-` resize. `scripts/check-gong.mjs` drives all of it headless
the way `check-gestures.mjs` does for the sky.

## Deploying

Static build to GitHub Pages: `.github/workflows/deploy.yml` builds on every
push to `main` and publishes `dist/`. `vite.config.js` sets `base` to
`/solar-system/` to match the project path and lists both pages
(`index.html` and `gong/index.html`) as build inputs, so the gong lands at
`dist/gong/`. MediaPipe's wasm runtime is copied
from `node_modules` into `public/wasm` before dev and build
(`scripts/copy-wasm.mjs`); the gesture model is committed in `public/models`.
