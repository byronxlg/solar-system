// The solar system as pure data and functions, so the renderer, the camera
// and node scripts all agree.
//
// World units: orbit radius = ORBIT_K * sqrt(a) with a in AU, so the inner
// planets stay readable beside Neptune (Neptune sits at about 100 units).
// Drawn radii are log-compressed for the same reason: Jupiter is about 3x
// Mercury on screen rather than 29x. Both scalings keep the ordering true.
//
// Time: an Earth year passes in YEAR_S real seconds. Planets start at their
// real heliocentric longitude for today (mean elements at J2000, circular
// orbits) and move on from there. Moon periods are compressed by a square
// root (see moonPeriodS) so Io does not blur while the Moon still crawls.
export const ORBIT_K = 18.2;
export const YEAR_S = 90;
export const WORLD_R = 108; // radius that the overview fits on screen

const J2000 = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86400e3;

// [name, a (AU), diameter (km), day (hours), year (days), colour, mean longitude at J2000 (deg), deg/day]
export const BODIES = [
  {
    key: "sun", name: "Sun", kind: "star", color: "#ffd166", r: 5, diameterKm: 1392700, dayH: 609.1,
    tagline: "The star at the centre",
    facts: { "Diameter": "1.39 million km", "Rotation": "25 days at the equator", "Age": "4.6 billion years", "Mass": "99.8% of the solar system" },
    note: "Every planet here would fit inside the Sun 1.3 million times over.",
  },
  {
    key: "mercury", name: "Mercury", a: 0.387, diameterKm: 4879, dayH: 1407.6, yearD: 87.97, color: "#b5aca3", L0: 252.25, rate: 4.09234,
    tagline: "Small, fast and scorched",
    facts: { "Diameter": "4,879 km", "Day": "59 Earth days", "Year": "88 Earth days", "Moons": "none" },
    note: "A day on Mercury lasts longer than its year: two sunrises per year.",
  },
  {
    key: "venus", name: "Venus", a: 0.723, diameterKm: 12104, dayH: 5832.5, yearD: 224.7, color: "#e8c98a", L0: 181.98, rate: 1.60213,
    tagline: "Earth's twin, wrapped in acid cloud",
    facts: { "Diameter": "12,104 km", "Day": "243 Earth days", "Year": "225 Earth days", "Moons": "none" },
    note: "Venus spins backwards, so the Sun rises in the west.",
  },
  {
    key: "earth", name: "Earth", a: 1, diameterKm: 12742, dayH: 23.9, yearD: 365.25, color: "#4f8fd6", L0: 100.46, rate: 0.98565,
    tagline: "Home",
    facts: { "Diameter": "12,742 km", "Day": "24 hours", "Year": "365 days", "Moons": "1" },
    note: "The only place we know of with liquid oceans on the surface.",
    moons: [{ name: "Moon", orbit: 3.4, r: 0.36, periodD: 27.3, color: "#c9c7c2" }],
  },
  {
    key: "mars", name: "Mars", a: 1.524, diameterKm: 6779, dayH: 24.6, yearD: 687, color: "#d2683f", L0: 355.45, rate: 0.52403,
    tagline: "The red desert",
    facts: { "Diameter": "6,779 km", "Day": "24.6 hours", "Year": "687 Earth days", "Moons": "2" },
    note: "Olympus Mons is three times the height of Everest.",
    moons: [
      { name: "Phobos", orbit: 1.9, r: 0.14, periodD: 0.32, color: "#a89a8e" },
      { name: "Deimos", orbit: 2.7, r: 0.11, periodD: 1.26, color: "#a89a8e" },
    ],
  },
  {
    key: "jupiter", name: "Jupiter", a: 5.203, diameterKm: 139820, dayH: 9.9, yearD: 4332.6, color: "#d9a877", L0: 34.40, rate: 0.08309,
    tagline: "The giant",
    facts: { "Diameter": "139,820 km", "Day": "9.9 hours", "Year": "11.9 Earth years", "Moons": "95" },
    note: "The Great Red Spot is a storm wider than Earth that has raged for centuries.",
    moons: [
      { name: "Io", orbit: 3.7, r: 0.3, periodD: 1.77, color: "#e4d36a" },
      { name: "Europa", orbit: 4.6, r: 0.27, periodD: 3.55, color: "#d8cdb8" },
      { name: "Ganymede", orbit: 5.8, r: 0.4, periodD: 7.15, color: "#a9a094" },
      { name: "Callisto", orbit: 7.4, r: 0.36, periodD: 16.7, color: "#7d766e" },
    ],
  },
  {
    key: "saturn", name: "Saturn", a: 9.537, diameterKm: 116460, dayH: 10.7, yearD: 10759, color: "#e6cf9a", L0: 49.94, rate: 0.03346, rings: [1.35, 2.3],
    tagline: "The ringed world",
    facts: { "Diameter": "116,460 km", "Day": "10.7 hours", "Year": "29.4 Earth years", "Moons": "146" },
    note: "Saturn is less dense than water. It would float, given a big enough bath.",
    moons: [{ name: "Titan", orbit: 4.6, r: 0.38, periodD: 15.9, color: "#d9a55c" }],
  },
  {
    key: "uranus", name: "Uranus", a: 19.19, diameterKm: 50724, dayH: 17.2, yearD: 30687, color: "#9fd7dd", L0: 313.23, rate: 0.01173, rings: [1.6, 1.75],
    tagline: "The tilted ice giant",
    facts: { "Diameter": "50,724 km", "Day": "17.2 hours", "Year": "84 Earth years", "Moons": "28" },
    note: "Uranus rolls around the Sun on its side, tilted by 98 degrees.",
    moons: [
      { name: "Titania", orbit: 3.4, r: 0.22, periodD: 8.7, color: "#bcb7b0" },
      { name: "Oberon", orbit: 4.3, r: 0.21, periodD: 13.5, color: "#a49f98" },
    ],
  },
  {
    key: "neptune", name: "Neptune", a: 30.07, diameterKm: 49244, dayH: 16.1, yearD: 60190, color: "#4b6fd8", L0: 304.88, rate: 0.00598,
    tagline: "The far blue edge",
    facts: { "Diameter": "49,244 km", "Day": "16.1 hours", "Year": "165 Earth years", "Moons": "16" },
    note: "Winds on Neptune reach 2,000 km/h, the fastest in the solar system.",
    moons: [{ name: "Triton", orbit: 3.4, r: 0.3, periodD: -5.88, color: "#d5cfc6" }],
  },
];

export const PLANETS = BODIES.filter((b) => b.kind !== "star");

// Drawn radius in world units, log-compressed from the real diameter.
export function drawRadius(b) {
  if (b.r) return b.r;
  return 0.9 + 1.15 * Math.log10(b.diameterKm / 4879);
}

export function orbitRadius(b) {
  return b.a ? ORBIT_K * Math.sqrt(b.a) : 0;
}

// Radius of the body with its moons and rings, for framing.
export function systemRadius(b) {
  const r = drawRadius(b);
  const moons = (b.moons || []).reduce((m, x) => Math.max(m, x.orbit * r + x.r * r), 0);
  const rings = b.rings ? b.rings[1] * r : 0;
  return Math.max(r * 4, moons * 1.25, rings * 1.6);
}

// Sim days elapsed since J2000 at sim second t (t = 0 is the moment the page
// loaded, at today's real date).
export function simDays(t, loadedAt = Date.now()) {
  return (loadedAt - J2000) / DAY_MS + (t * 365.25) / YEAR_S;
}

// Heliocentric position at sim time t. Counter-clockwise seen from the north,
// which on a y-down canvas means y = -sin.
export function bodyPosition(b, t, loadedAt) {
  if (!b.a) return { x: 0, y: 0 };
  const days = simDays(t, loadedAt);
  const lon = ((b.L0 + b.rate * days) * Math.PI) / 180;
  const r = orbitRadius(b);
  return { x: r * Math.cos(lon), y: -r * Math.sin(lon) };
}

// Moon periods: square-root compressed so every moon is visibly moving and
// none is a blur. A negative real period (Triton) keeps its retrograde sense.
export function moonPeriodS(m) {
  return Math.sign(m.periodD) * 4 * Math.sqrt(Math.abs(m.periodD));
}

export function moonPosition(planet, m, t, index = 0) {
  const r = drawRadius(planet) * m.orbit;
  const phase = index * 1.9; // spread the moons out at t = 0
  const ang = phase + (2 * Math.PI * t) / moonPeriodS(m);
  return { x: r * Math.cos(ang), y: -r * Math.sin(ang) };
}

// Screen pixels per world unit for a container, at zoom scale (1 = overview).
export function pxPerUnit(size, scale = 1) {
  return (Math.min(size.width, size.height) / (2 * WORLD_R)) * scale;
}

// Zoom that frames a body with its moons: the system radius fills a fraction
// of the shorter side.
export function focusScale(b, size) {
  const px = pxPerUnit(size, 1);
  const wanted = Math.min(size.width, size.height) * 0.36;
  return wanted / (systemRadius(b) * px);
}
