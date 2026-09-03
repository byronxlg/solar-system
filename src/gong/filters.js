// One Euro filter (Casiez, Roussel, Vogel 2012), the same one the solar
// system uses: heavy smoothing while the hand is still, light while it
// moves fast, so a still hand is steady and a swing has no lag. Units:
// normalised frame coordinates, milliseconds in, seconds inside.
const MIN_CUTOFF = 1.2;
const BETA = 4;
const D_CUTOFF = 1;
const smoothing = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export function makeOneEuro(minCutoff = MIN_CUTOFF, beta = BETA) {
  let x = null;
  let dx = 0;
  let t = null;
  return (value, now) => {
    if (x === null) {
      x = value;
      t = now;
      return value;
    }
    const dt = Math.max(1e-3, (now - t) / 1000);
    t = now;
    dx += smoothing(D_CUTOFF, dt) * ((value - x) / dt - dx);
    x += smoothing(minCutoff + beta * Math.abs(dx), dt) * (value - x);
    return x;
  };
}

// Where on the plate a hit landed, as a word for the captions.
export function deflectionLabel(r) {
  if (r < 0.3) return " on the centre";
  if (r < 0.75) return "";
  return " on the rim";
}
