# Hyperframes Composition Brief: solar-system

## Output
- Composition `brag/composition/`, render `brag/brag.mp4`, poster `brag/brag.jpg`
- Landscape 1920x1080, 20 s, 30 fps

## Source material
- Read: README.md, src/App.css, src/Controls.jsx, src/solar.js, src/App.jsx,
  src/gong/Controls.jsx, docs/control-system.md
- Copy verbatim: the README first sentence; "Main view", "Show a hand to the camera", the
  five browse control rows; the Jupiter card (name, tagline, diameter, year, note); "Play",
  "Strike the gong with a full swing of the arm"; "No buttons, no server: a static site with
  two apps that share one kiosk."
- Key visual: the 1fr / 520px sky-and-kiosk grid with the paper panel and keycap rows

## Creative direction
- Tone polished. Real data only: orbit radii square-root compressed and the planets' colours
  from src/solar.js; no invented copy.
- Avoid: generic language, abstract filler, redesigning the kiosk.

## Visual identity
- Tokens and font stack as in brag-plan.md. The sky is inline SVG built once from a seeded
  generator so every frame is deterministic.

## Audio
- `assets/music/bed.mp3` (vol-10, trimmed and faded with ffmpeg), volume 0.30
- `impact/impactSoft_medium_001.ogg` at 8.73 (0.45); `interface/bong_001.ogg` at 14.20
  (0.55) and 16.93 (0.45)
- RMS pre-extracted to `assets/audio-rms.js` (hyperframes-creative extract-audio-data.py)

## Hyperframes instructions
Standalone composition, one paused GSAP timeline registered after `document.fonts.ready`,
root `data-duration="20"`. `npx hyperframes check` must pass before render.
