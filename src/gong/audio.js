// The gong's voice, synthesised in Web Audio: no samples. A strike is a
// bank of sine partials at inharmonic ratios, each with its own decay, a
// burst of filtered noise for the mallet's contact, and a delayed swell of
// the upper partials, which is the bloom a real gong does a moment after
// the hit. Everything runs through a synthetic hall so it sits in a room.
//
// The context starts on the first user gesture (browsers require one);
// until then strikes are silent and `unlocked` is false.
import { fundamentalHz, strikeSpectrum } from "./gongs.js";

const MAX_VOICES = 10;
const MASTER = 0.45;

let ctx = null;
let master = null;
let hall = null;
let noiseBuf = null;
let analyser = null;
let levelBuf = null;
const voices = []; // { nodes: [], stop: (t) => void, at }

export function unlocked() {
  return !!ctx && ctx.state === "running";
}

// Call from a click, key or touch. Safe to call every time.
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    hall = ctx.createConvolver();
    hall.buffer = impulse(ctx, 2.8, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    // a limiter after the compressor so two full hits stacked never clip
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;
    master.connect(comp);
    master.connect(hall);
    hall.connect(wet);
    wet.connect(comp);
    comp.connect(limiter);
    limiter.connect(ctx.destination);
    // the stage reads the level off the output so the glow follows the sound
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    limiter.connect(analyser);
    levelBuf = new Float32Array(analyser.fftSize);
    noiseBuf = noise(ctx, 2);
  }
  if (ctx.state !== "running") ctx.resume();
  return ctx.state === "running";
}

// An exponentially decaying noise burst, stereo, as the hall.
function impulse(ac, seconds, decay) {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return buf;
}

function noise(ac, seconds) {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// How loud the output is right now, 0..1 (RMS, scaled), for the visuals.
export function level() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(levelBuf);
  let sum = 0;
  for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
  return Math.min(1, Math.sqrt(sum / levelBuf.length) * 1.8);
}

// The loudest sample in the latest block, for checking against clipping.
export function peak() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(levelBuf);
  let top = 0;
  for (let i = 0; i < levelBuf.length; i++) top = Math.max(top, Math.abs(levelBuf[i]));
  return top;
}

// Strike the gong.
//   gong, mallet: from gongs.js
//   size: gong size multiple (scales the pitch)
//   r: where it landed, 0 centre .. 1 rim
//   strength: 0..1
//   pan: -1 left .. 1 right, where on the plate it landed
// Returns the voice's rough duration in seconds, or 0 when audio is locked.
export function strike({ gong, mallet, size, r, strength, pan = 0 }) {
  if (!unlocked()) return 0;
  const t = ctx.currentTime;
  const f0 = fundamentalHz(gong, size);
  const { gains, noise: noiseLevel, shimmer } = strikeSpectrum(gong, mallet, r, strength);
  const amp = 0.12 + 0.88 * Math.pow(strength, 1.4);
  const nodes = [];
  const out = ctx.createGain();
  out.gain.value = amp;
  // a hit on the left of the plate sits a little left
  let sink = master;
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan)) * 0.5;
    panner.connect(master);
    sink = panner;
    nodes.push(panner);
  }
  out.connect(sink);
  nodes.push(out);
  const n = gong.partials.length;
  const longest = gong.lowDecay * Math.pow(size, 0.5) * (0.6 + 0.4 * strength);

  gong.partials.forEach((ratio, i) => {
    const u = i / (n - 1);
    const g = gains[i];
    if (g < 0.01) return;
    const hz = f0 * ratio;
    if (hz > 12000) return;
    // low partials last, high ones fade, a big gong rings longer
    const decay = (gong.lowDecay + (gong.highDecay - gong.lowDecay) * u) * Math.pow(size, 0.5) * (0.6 + 0.4 * strength);
    // the upper partials bloom: they come in late and swell
    const swell = u > 0.35 ? shimmer * (u - 0.35) / 0.65 : 0;
    const peakAt = t + 0.01 + swell * 0.55;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g * (1 - swell * 0.6), t + 0.006 + u * 0.01);
    if (swell > 0) env.gain.linearRampToValueAtTime(g, peakAt);
    env.gain.setTargetAtTime(0, peakAt, decay / 4.6); // -60 dB at about `decay`
    // two oscillators a hair apart give the slow beat of a real plate
    for (const det of [0, 1]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz * (1 + det * (0.0022 + 0.0016 * u));
      // the pitch sags a touch as the plate settles after a hard hit
      osc.frequency.setValueAtTime(hz * (1 + det * 0.002) * (1 + 0.012 * strength), t);
      osc.frequency.exponentialRampToValueAtTime(hz * (1 + det * (0.0022 + 0.0016 * u)), t + 0.25);
      const share = ctx.createGain();
      share.gain.value = det ? 0.45 : 0.55;
      osc.connect(share);
      share.connect(env);
      osc.start(t);
      osc.stop(t + decay + 0.5);
      nodes.push(osc, share);
    }
    env.connect(out);
    nodes.push(env);
  });

  // contact noise: the mallet's knock
  if (noiseLevel > 0.01) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = mallet.noiseHz * (0.8 + 0.4 * strength);
    bp.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(noiseLevel * 0.5, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0005, t + mallet.contact + 0.03);
    src.connect(bp);
    bp.connect(env);
    env.connect(out);
    src.start(t);
    src.stop(t + mallet.contact + 0.1);
    nodes.push(src, bp, env);
  }

  // the wash: a hard hit on a big bronze plate roars, a band of noise that
  // swells in behind the attack and hangs on
  const wash = shimmer * Math.pow(strength, 1.6) * (0.5 + 0.5 * mallet.hardness);
  if (wash > 0.04) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400 * Math.pow(size, -0.4) * (0.8 + 0.5 * strength);
    bp.Q.value = 0.7;
    const env = ctx.createGain();
    const peakAt = t + 0.08 + 0.35 * (1 - strength);
    const hang = 1.2 + 2.2 * strength * Math.sqrt(size);
    env.gain.setValueAtTime(0.0005, t);
    env.gain.exponentialRampToValueAtTime(wash * 0.2, peakAt);
    env.gain.setTargetAtTime(0, peakAt, hang / 4.6);
    src.connect(bp);
    bp.connect(env);
    env.connect(out);
    src.start(t);
    src.stop(t + hang + 1);
    nodes.push(src, bp, env);
  }

  // the thump: a soft mallet hit hard puts weight into the plate, a short
  // low sine under the fundamental
  const thump = (1 - mallet.hardness) * Math.pow(strength, 2) * (1 - 0.6 * r);
  if (thump > 0.05) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const hz = Math.max(32, f0 * 0.5);
    osc.frequency.setValueAtTime(hz * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(hz, t + 0.06);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(thump * 0.55, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
    osc.connect(env);
    env.connect(out);
    osc.start(t);
    osc.stop(t + 0.3);
    nodes.push(osc, env);
  }

  // the ping: a hard head leaves a metallic click of its own, two high
  // inharmonic sines that die at once
  if (mallet.hardness > 0.6) {
    const ping = (mallet.hardness - 0.6) / 0.4 * (0.3 + 0.7 * strength);
    for (const ratio of [1, 1.47]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = (2600 + 1200 * mallet.hardness) * ratio * (0.95 + Math.random() * 0.1);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(ping * 0.18, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0005, t + 0.05 + 0.05 * strength);
      osc.connect(env);
      env.connect(out);
      osc.start(t);
      osc.stop(t + 0.15);
      nodes.push(osc, env);
    }
  }

  const voice = {
    nodes, at: t,
    stop(when, seconds = 0.15) {
      out.gain.cancelScheduledValues(when);
      out.gain.setValueAtTime(out.gain.value, when);
      out.gain.linearRampToValueAtTime(0, when + seconds);
    },
  };
  voices.push(voice);
  // the oldest voices bow out when the bank is full
  while (voices.length > MAX_VOICES) voices.shift().stop(t, 0.4);
  // let go of the nodes once they have died away
  setTimeout(() => {
    const i = voices.indexOf(voice);
    if (i >= 0) voices.splice(i, 1);
    for (const nd of nodes) try { nd.disconnect(); } catch {}
  }, (longest + 1) * 1000);
  return longest;
}

// A palm on the plate: everything ringing fades out fast.
export function damp(seconds = 0.18) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const v of voices) v.stop(t, seconds);
  voices.length = 0;
}

export function ringing() {
  return voices.length;
}
