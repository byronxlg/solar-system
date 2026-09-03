// The gongs and the mallets as pure data, so the stage, the sound and node
// scripts all agree.
//
// A gong is a theme: how it looks (face colours, boss, rim, hammer marks,
// and for the planets bands, a spot, craters, land, a ring, a corona or an
// accretion disc) and how it rings (fundamental at its base diameter,
// partial ratios and how long the low and high partials last, how much it
// shimmers). Size scales the fundamental: a gong twice the diameter rings
// about an octave lower. cm is the base diameter.
//
// A mallet decides the attack: how hard the head is (brightness), how much
// contact noise it makes and how long the strike lasts.

export const GONGS = [
  {
    key: "chau", name: "Chau gong", tagline: "The bronze temple gong", cm: 90,
    color: "#b07a3c", rim: "#4a2e14", boss: null, accent: "#d9931f",
    face: ["#e0b26f", "#b07a3c", "#6d4520", "#3a2410"],
    // black lacquer ring around the lip and in the centre, like a real chau
    lacquer: [0.16, 0.82],
    marks: 0.9, // hammer-mark density
    hz: 92, // fundamental at the base diameter
    partials: [1, 1.51, 1.99, 2.47, 2.96, 3.55, 4.18, 5.07, 6.24, 7.36, 8.9, 10.4],
    lowDecay: 9, highDecay: 2.2, shimmer: 0.8, // seconds, and the delayed swell of the high partials
    facts: { "Origin": "China", "Voice": "Deep crash, slow bloom", "Base size": "90 cm" },
    note: "The crash cymbal of the orchestra pit: quiet at first, then it blooms.",
  },
  {
    key: "symphonic", name: "Symphonic gong", tagline: "Golden and endless", cm: 100,
    color: "#d4a84b", rim: "#6b4d1c", boss: null, accent: "#e3b341",
    face: ["#fbe6a3", "#d4a84b", "#9a6f27", "#5b3f14"],
    lacquer: null,
    marks: 0.6,
    hz: 78,
    partials: [1, 1.42, 1.8, 2.31, 2.74, 3.12, 3.7, 4.5, 5.4, 6.8, 8.3, 9.9, 12.1],
    lowDecay: 14, highDecay: 3.5, shimmer: 1,
    facts: { "Origin": "Europe", "Voice": "Huge wash of harmonics", "Base size": "100 cm" },
    note: "Played softly it hums for half a minute; played hard it roars.",
  },
  {
    key: "wind", name: "Wind gong", tagline: "Flat, thin and bright", cm: 70,
    color: "#c9a25e", rim: null, boss: null, accent: "#c4a24f",
    face: ["#eed394", "#c9a25e", "#8f6b2c", "#4e3714"],
    lacquer: null,
    marks: 1.2,
    hz: 140,
    partials: [1, 1.63, 2.12, 2.6, 3.3, 4.1, 5.2, 6.5, 8.1, 9.7, 11.6],
    lowDecay: 5, highDecay: 1.6, shimmer: 0.5,
    facts: { "Origin": "China", "Voice": "Splash and sizzle", "Base size": "70 cm" },
    note: "No rim to hold the sound in, so it speaks at once and fades fast.",
  },
  {
    key: "tibetan", name: "Tibetan gong", tagline: "A boss in the middle, a note you can hum", cm: 60,
    color: "#8d7350", rim: "#3d2f1a", boss: 0.18, accent: "#a8895a",
    face: ["#c9b088", "#8d7350", "#5a4630", "#2f2416"],
    lacquer: null,
    marks: 0.4,
    hz: 110,
    partials: [1, 2.0, 3.0, 4.02, 5.1, 6.05, 7.3, 8.6, 10.1],
    lowDecay: 11, highDecay: 2.8, shimmer: 0.3,
    facts: { "Origin": "Himalaya", "Voice": "A clear pitch, a slow beat", "Base size": "60 cm" },
    note: "The boss gives it a definite note; the partials are nearly harmonic.",
  },
  {
    key: "iron", name: "Iron gong", tagline: "Black, heavy and dry", cm: 110,
    color: "#4b4c52", rim: "#1c1d22", boss: 0.1, accent: "#8a8f9c",
    face: ["#8b8d95", "#4b4c52", "#2a2b30", "#121316"],
    lacquer: null,
    marks: 1.4,
    hz: 66,
    partials: [1, 1.38, 1.9, 2.55, 3.4, 4.6, 5.9, 7.5],
    lowDecay: 6, highDecay: 1.2, shimmer: 0.15,
    facts: { "Origin": "The foundry", "Voice": "A thud with a growl", "Base size": "110 cm" },
    note: "Cast iron does not sing like bronze. It thuds, and the thud goes on.",
  },
  {
    key: "moon", name: "Moon gong", tagline: "Silver, cold and glassy", cm: 80,
    color: "#b9c4d6", rim: "#4c5670", boss: null, accent: "#8fb3ff",
    face: ["#f2f6ff", "#b9c4d6", "#6f7d99", "#2f3750"],
    lacquer: [0.5, 0.56],
    craters: 10,
    marks: 0.3,
    hz: 196,
    partials: [1, 1.5, 2.25, 3.0, 3.75, 4.5, 5.6, 6.9, 8.4, 10.2, 12.5],
    lowDecay: 12, highDecay: 5, shimmer: 1.2,
    facts: { "Origin": "Somewhere else", "Voice": "Bells under water", "Base size": "80 cm" },
    note: "Not a real alloy. The partials are stacked in fifths, so it rings like a chord.",
  },
  // The planets. Not alloys either: each one rings the way it looks.
  {
    key: "sun", name: "Sun gong", tagline: "A roar that never ends", cm: 150,
    color: "#ff9a2e", rim: null, boss: null, accent: "#ffcf5a",
    face: ["#fff6c0", "#ffb640", "#e5651c", "#7a2a06"],
    lacquer: null, corona: 1,
    marks: 0.15,
    hz: 42,
    partials: [1, 1.27, 1.61, 2.03, 2.5, 3.1, 3.8, 4.7, 5.9, 7.4, 9.2, 11.5],
    lowDecay: 22, highDecay: 5, shimmer: 1.6,
    facts: { "Origin": "The middle of everything", "Voice": "A furnace, humming", "Base size": "150 cm" },
    note: "Every partial at once and none of them in tune. It does not so much ring as burn.",
  },
  {
    key: "earth", name: "Earth gong", tagline: "Blue, with weather", cm: 90,
    color: "#3f8fd6", rim: "#1e3d66", boss: null, accent: "#6fc3ff",
    face: ["#a8dbff", "#3f8fd6", "#1f5a9c", "#0d2b52"],
    lacquer: null, land: 1, clouds: 1,
    marks: 0,
    hz: 96,
    partials: [1, 1.5, 2, 2.5, 3, 3.6, 4.3, 5.2, 6.4, 7.9, 9.6],
    lowDecay: 10, highDecay: 3, shimmer: 0.9,
    facts: { "Origin": "Home", "Voice": "Warm and round", "Base size": "90 cm" },
    note: "Nearly harmonic partials, so it sounds like a note with an ocean in it.",
  },
  {
    key: "mars", name: "Mars gong", tagline: "Red dust and old craters", cm: 75,
    color: "#c65a34", rim: "#5a2312", boss: null, accent: "#f0895e",
    face: ["#f3a882", "#c65a34", "#8a3a1f", "#3e180b"],
    lacquer: null, craters: 16, cap: 1,
    marks: 0.5,
    hz: 120,
    partials: [1, 1.44, 1.87, 2.35, 2.9, 3.6, 4.5, 5.7],
    lowDecay: 5, highDecay: 1.4, shimmer: 0.25,
    facts: { "Origin": "Next door", "Voice": "Dry and short", "Base size": "75 cm" },
    note: "Thin air, thin sound. It knocks more than it sings, and the dust takes the rest.",
  },
  {
    key: "jupiter", name: "Jupiter gong", tagline: "The deepest note there is", cm: 140,
    color: "#d8a778", rim: "#6b4a2c", boss: null, accent: "#f0c48a",
    face: ["#f8e4c8", "#d8a778", "#a06c45", "#4a2f1d"],
    lacquer: null,
    bands: [
      { y: -0.72, h: 0.1, color: "#b57a52", a: 0.5 }, { y: -0.48, h: 0.08, color: "#f6e8d3", a: 0.55 },
      { y: -0.22, h: 0.14, color: "#a8623d", a: 0.55 }, { y: 0.04, h: 0.1, color: "#f8ecd8", a: 0.5 },
      { y: 0.3, h: 0.16, color: "#9c5a38", a: 0.5 }, { y: 0.6, h: 0.1, color: "#ead6bb", a: 0.4 },
    ],
    spot: { x: 0.28, y: 0.34, rx: 0.17, ry: 0.09, color: "#c94a2e" },
    marks: 0,
    hz: 34,
    partials: [1, 1.19, 1.41, 1.73, 2.08, 2.51, 3.02, 3.6, 4.4, 5.3, 6.5, 8],
    lowDecay: 26, highDecay: 6, shimmer: 1.2,
    facts: { "Origin": "The big one", "Voice": "A storm, very slowly", "Base size": "140 cm" },
    note: "Partials packed tight at the bottom. Hit it hard and the room moves before you hear it.",
  },
  {
    key: "saturn", name: "Saturn gong", tagline: "A chord with rings round it", cm: 130,
    color: "#e6c98a", rim: "#7a6236", boss: null, accent: "#f5dfa6",
    face: ["#fdf1d4", "#e6c98a", "#b39257", "#5a4626"],
    lacquer: null,
    bands: [{ y: -0.5, h: 0.12, color: "#c9a86a", a: 0.35 }, { y: -0.1, h: 0.18, color: "#f8ecd2", a: 0.35 }, { y: 0.35, h: 0.14, color: "#bd9a5c", a: 0.35 }],
    ring: { inner: 1.3, outer: 1.95, tilt: 0.26, color: "#d9c9a3" },
    marks: 0,
    hz: 55,
    partials: [1, 1.25, 1.5, 1.875, 2.25, 2.81, 3.38, 4.22, 5.06, 6.33, 7.6],
    lowDecay: 18, highDecay: 5, shimmer: 1.4,
    facts: { "Origin": "Sixth from the Sun", "Voice": "Golden, in thirds and fifths", "Base size": "130 cm" },
    note: "The partials are stacked in thirds and fifths, so a hit is a chord, and the ring shimmers on after.",
  },
  {
    key: "neptune", name: "Neptune gong", tagline: "Cold wind, far away", cm: 100,
    color: "#3e63d8", rim: "#1c2d6b", boss: null, accent: "#8fb0ff",
    face: ["#b3c8ff", "#3e63d8", "#2440a0", "#0f1a4d"],
    lacquer: null,
    bands: [{ y: -0.35, h: 0.1, color: "#6f8df0", a: 0.3 }, { y: 0.25, h: 0.14, color: "#1e3396", a: 0.35 }],
    spot: { x: -0.25, y: -0.22, rx: 0.12, ry: 0.07, color: "#16257a" },
    marks: 0,
    hz: 150,
    partials: [1, 1.58, 2.3, 3.1, 4.05, 5.2, 6.6, 8.3, 10.4],
    lowDecay: 9, highDecay: 4.5, shimmer: 1.5,
    facts: { "Origin": "The far edge", "Voice": "Glassy, with a wind in it", "Base size": "100 cm" },
    note: "Stretched partials and a long shimmer. The fastest winds in the solar system, ringing.",
  },
  {
    key: "hole", name: "Black hole gong", tagline: "Felt more than heard", cm: 160,
    color: "#ff8c42", rim: null, boss: null, accent: "#ffb070",
    face: ["#050505", "#000000", "#000000", "#000000"],
    lacquer: null, disc: 1,
    marks: 0,
    hz: 28,
    partials: [1, 1.5, 2.02, 2.9, 4.1],
    lowDecay: 34, highDecay: 3, shimmer: 0.1,
    facts: { "Origin": "The edge of nowhere", "Voice": "A drone below hearing", "Base size": "160 cm" },
    note: "Almost nothing above the fundamental, and the fundamental is almost below you. The disc is the only light.",
  },
];

export const MALLETS = [
  {
    key: "felt", name: "Felt mallet", tagline: "Soft, round and warm",
    head: "#d9cbb3", headRing: "#b3a184", shaft: "#7a5a3a", headR: 1, shape: "round",
    hardness: 0.25, noise: 0.25, noiseHz: 400, contact: 0.09,
    note: "The gong player's default. Lets the low partials speak.",
  },
  {
    key: "wool", name: "Wool beater", tagline: "Big, slow and deep",
    head: "#efe7db", headRing: "#c9bda6", shaft: "#5f4530", headR: 1.35, shape: "round",
    hardness: 0.12, noise: 0.15, noiseHz: 250, contact: 0.14,
    note: "A pillow on a stick. Almost no attack, all bloom.",
  },
  {
    key: "rubber", name: "Rubber mallet", tagline: "Firm and clear",
    head: "#2f2f35", headRing: "#55555c", shaft: "#a88a5a", headR: 0.8, shape: "round",
    hardness: 0.55, noise: 0.35, noiseHz: 900, contact: 0.05,
    note: "Brings out the middle of the gong and a little knock.",
  },
  {
    key: "wood", name: "Wooden stick", tagline: "Hard and bright",
    head: "#c8955a", headRing: "#8c5f2e", shaft: "#c8955a", headR: 0.55, shape: "round",
    hardness: 0.8, noise: 0.6, noiseHz: 1800, contact: 0.025,
    note: "A drumstick. Sharp knock, lots of sizzle, less bass.",
  },
  {
    key: "steel", name: "Steel rod", tagline: "Metal on metal",
    head: "#dfe3ea", headRing: "#8c94a3", shaft: "#aab1bf", headR: 0.4, shape: "rod",
    hardness: 1, noise: 0.9, noiseHz: 3200, contact: 0.012,
    note: "Nothing but the high partials and a clang. Sparks, on a good day.",
  },
];

// Gong size as a multiple of the base diameter. The gesture and the keys
// work in this range.
export const MIN_SIZE = 0.5;
export const MAX_SIZE = 1.8;
export const BASE_CM = Object.fromEntries(GONGS.map((g) => [g.key, g.cm]));

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function diameterCm(gong, size) {
  return Math.round(gong.cm * size);
}

// Fundamental frequency at this size: pitch falls with diameter, a touch
// more than inversely, because a bigger gong is also thicker in the middle.
export function fundamentalHz(gong, size) {
  return gong.hz / Math.pow(size, 1.1);
}

// How a strike sounds, from where it landed and how hard.
//   r: distance from the centre, 0..1 of the radius
//   strength: 0..1
// Returns per-partial gains (0..1), the noise level and the shimmer amount.
export function strikeSpectrum(gong, mallet, r, strength) {
  const n = gong.partials.length;
  const edge = clamp(r, 0, 1);
  const bright = clamp(0.35 + 0.65 * mallet.hardness * (0.5 + 0.5 * strength), 0, 1.2);
  const gains = gong.partials.map((ratio, i) => {
    const u = i / (n - 1); // 0 low .. 1 high
    // the centre drives the fundamental, the edge drives the upper partials
    const position = 1 - 0.7 * Math.abs(u - edge * 0.8);
    // hard mallets tilt the spectrum up; soft ones roll it off
    const tilt = Math.pow(bright, u * 2.2) * (1 - u * (1 - bright) * 0.8);
    const level = position * tilt / Math.pow(ratio, 0.55);
    return clamp(level, 0, 1);
  });
  const noise = mallet.noise * (0.4 + 0.6 * strength);
  const shimmer = gong.shimmer * (0.3 + 0.7 * strength) * (0.6 + 0.4 * edge);
  return { gains, noise, shimmer };
}
