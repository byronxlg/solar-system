// Wave: an open hand swinging side to side, the natural hello at a kiosk.
// It is a motion, not a pose, so it is not held like the other gestures: the
// tracker keeps each hand's recent fingertip x position and counts direction
// changes. Progress is the count over WAVE_TURNS and reaches 1 when the wave
// is complete; the kiosk shows it in the same filling pill as a hold.
//
//   window: samples older than WAVE_WINDOW_MS are dropped, so the whole wave
//           has to happen within about a second and a half
//   swing:  a direction change only counts once the hand has come back at
//           least WAVE_SWING hand units (palm length, see handUnit in Kiosk)
//   open:   at least WAVE_OPEN of the samples must be an open hand, so a fist
//           or a pointing finger moving about does not count. Not every
//           sample, because the landmarks wobble on a fast-moving hand.

export const WAVE = "Wave";
export const WAVE_WINDOW_MS = 1500;
export const WAVE_TURNS = 2;
export const WAVE_SWING = 0.5;
export const WAVE_OPEN = 0.5;

// Per-hand sample history keyed by whatever identifies the hand between
// frames (the kiosk uses the Left/Right handedness label).
export function makeWaveTracker() {
  const hands = new Map();
  return {
    // Adds a sample { t, x, unit, open } for hand `key`; returns progress 0..1.
    update(key, sample) {
      const samples = (hands.get(key) || []).filter((s) => sample.t - s.t <= WAVE_WINDOW_MS);
      samples.push(sample);
      hands.set(key, samples);
      return waveProgress(samples);
    },
    reset() {
      hands.clear();
    },
  };
}

// Counts direction changes in a run of samples. A change counts when the hand
// has moved back by more than a swing from the furthest point it reached in
// the previous direction, so jitter around a still hand never adds up.
export function waveProgress(samples) {
  if (samples.length < 3) return 0;
  const open = samples.filter((s) => s.open).length;
  if (open < samples.length * WAVE_OPEN) return 0;
  const swing = WAVE_SWING * samples[samples.length - 1].unit;
  let dir = 0;
  let ext = samples[0].x;
  let turns = 0;
  for (const s of samples) {
    const d = s.x - ext;
    if (dir === 0) {
      if (Math.abs(d) > swing) {
        dir = Math.sign(d);
        ext = s.x;
      }
    } else if (d * dir > 0) {
      ext = s.x;
    } else if (-d * dir > swing) {
      dir = -dir;
      ext = s.x;
      turns++;
    }
  }
  return Math.min(1, turns / WAVE_TURNS);
}

// Open hand from the landmarks alone: all four fingertips further from the
// wrist than their middle joints. Independent of the gesture classifier,
// which drops out on a moving hand.
export function isOpenHand(lm) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  const wrist = lm[0];
  return [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ].every(([tip, pip]) => d(lm[tip], wrist) > d(lm[pip], wrist));
}
