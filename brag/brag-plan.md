# Brag Plan: solar-system

## What is this app?
A solar system you fly through with your hands, and a gong you bang with them. Vite + React,
MediaPipe hand and body tracking in the browser, a static site on GitHub Pages at
https://byronxlg.com/solar-system/ and /gong/.

## The angle
The kiosk as it is: the sky on the left, the paper control panel on the right, the real
control copy. One gesture shown end to end (point at Jupiter, hold, fly there, the card), then
the gong, then the README's own one-liner as the outro.

## Hook (first 3 s)
The README's first sentence on a starfield: "A solar system you fly through with your hands,
and a gong you bang with them."

## Key moments
- The sky builds: Sun, orbits, the eight planets in their real colours (src/solar.js), the
  Main view panel with "Show a hand to the camera" and five control rows.
- Point at Jupiter: reticle, ring fills for a second, the sky flies in, "Fly there" flashes
  yellow in the panel, the Jupiter card rises with its note.
- The gong: bronze plate in its frame, Play mode, "Strike the gong with a full swing of the
  arm", one strike with halo and ring.

## Outro / punchline
`solar-system` wordmark, "No buttons, no server: a static site with two apps that share one
kiosk.", byronxlg.com/solar-system/.

## Tone
- Preset: polished. Long holds, one camera move, one strike.

## Format: landscape - 1920x1080
## Duration: 20s

## Visual identity (from src/App.css, src/Controls.jsx, src/solar.js, src/gong)
- Space #0b0e1a, paper #f4efe6, card #fbf8f2, ink #2b2f3a, sea #3b7fc4 (Main view), bronze
  (Play), gold #f5c542 (the fired row, the time pill)
- Font: "Avenir Next", "Helvetica Neue", Arial (the kiosk font stack, named explicitly)

## Audio direction
- Music: happy-beats-business-moves-vol-10 (109.96 BPM), trimmed to 20 s, volume 0.30,
  0.6 s fade in, fade out from 18.5 s. Cues: 3.55 panel lands, 4.10 to 6.28 planets on the
  beat grid, 8.73 fly, 9.29 card, 13.11 gong stage, 14.20 strike, 16.93 wordmark, 17.47 and
  18.01 for the outro lines.
- Audio-reactive: RMS breathes the sun glow only.
- SFX: soft impact on the fly, bong on the strike and on the wordmark.

## Storyboard
1. Hook 0.0-3.2: sentence rises 0.2, holds to 2.85, fades.
2. The app 3.2-13.0: panel and Sun 3.55, orbits 3.7 staggered, planets from 4.10 every 0.27,
   HUD 4.3; reticle on Jupiter 7.35, ring fills to 8.7; fly 8.73 (sky scales 3.2x in 1.4 s,
   labels fade, "Fly there" fires); card 9.29; hold; fade 12.6.
3. Gong 13.0-16.6: stage 13.11, panel 13.3; strike 14.20 (scale pulse, halo); fade 16.25.
4. Outro 16.6-20.0: wordmark 16.93, tagline 17.47, URL 18.01.

Poster: 10.6 s, Jupiter focused with its card and the fired row.
