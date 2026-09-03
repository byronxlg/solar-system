import { useEffect, useRef, useState } from "react";
import { DrawingUtils, GestureRecognizer } from "@mediapipe/tasks-vision";
import { useGestureRecognizer } from "./useGestureRecognizer.js";
import { WAVE, makeWaveTracker, isOpenHand } from "./wave.js";
import { rateLabel } from "./useCamera.js";
import { FLY_DEAD, FLY_FULL, DIAL_DEAD, DIAL_SPAN } from "./useViewGestures.js";

// Always-on camera. Draws hand skeletons, recognised gestures, the navigate
// overlays and the current caption; reports held gestures and per-frame hand
// positions upward.
//
// props:
//   mode      "browse" | "navigate" | "tour"
//   color     accent (the panel frame is styled by CSS)
//   hint      situational line in the legend under the camera
//   note      optional explanation under the hint
//   controls  [[you do, it does, key], ...] rows listed under the hint; key is the
//             gesture (or "pan", "zoom") the row stands for
//   live      "point" | "pan" | "zoom" | "fly" | "time" | null, what the sky is doing right now
//   liveLabel optional caption for it (e.g. "Aiming at Mars")
//   overlayRef ref to { fly, dial } from useViewGestures, drawn over the hand
//   viewRef   ref to the camera state ({ scale }), read for the zoom badge
//   event     { key, label, at } the control that just fired; captioned for FIRED_MS
//   gestures  gesture names that are held in this mode (drawn yellow, hold pill)
//   liveGestures gesture names that drive the sky continuously in this mode (drawn yellow)
//   onGesture(name), onHands(hands) every frame

// The camera is shown mirrored, like a mirror. Spatial overlays are drawn in
// the mirrored frame; text stays upright.
export const MIRROR = true;

// Overlay colours: hands are white until they match a gesture this mode
// listens for, then warm yellow (also the hold pill).
const ACTIVE = "#f5c542";
const IDLE = "rgba(255,255,255,0.92)";
const SCRIM = "rgba(11,14,26,0.72)";
const FONT = '"Avenir Next", "Avenir", "Helvetica Neue", system-ui, sans-serif';

const HOLD_MS = 600;
// Per-gesture confidence needed before a gesture counts. Open Palm tends to
// score lower than the others, so it gets a lower bar.
export const MIN_SCORES = { Open_Palm: 0.4, Pointing_Up: 0.45 };
const DEFAULT_MIN_SCORE = 0.6;
export const minScore = (name) => MIN_SCORES[name] ?? DEFAULT_MIN_SCORE;
const COOLDOWN_MS = 1500;
const FIRED_MS = 1100;
const LIVE_LABEL = { pan: "Panning", zoom: "Zooming", fly: "Flying", point: "Aiming", time: "Time", strike: "Mallet in hand", resize: "Resizing" };

export default function Kiosk({ mode, color = "#3b7fc4", hint, note = null, controls = [], gestures = [], liveGestures = [], onGesture, onHands, live = null, liveLabel = null, overlayRef: skyOverlayRef = null, viewRef = null, event = null }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);
  const propsRef = useRef({});
  propsRef.current = { mode, color, hint, controls, gestures, liveGestures, onGesture, onHands, live, liveLabel, skyOverlayRef, viewRef, event };
  const [held, setHeld] = useState(null); // gesture being held right now, lights its legend row
  const [fired, setFired] = useState(null); // control key that just fired, flashes its legend row
  const holdRef = useRef({ since: {}, armed: {}, lastFired: {} });
  const waveRef = useRef(makeWaveTracker());
  const [cameraError, setCameraError] = useState(null);
  const gesture = useGestureRecognizer();
  const ready = gesture.status === "ready";

  useEffect(() => {
    if (!event) return;
    setFired(event.key);
    const t = setTimeout(() => setFired(null), FIRED_MS);
    return () => clearTimeout(t);
  }, [event]);

  useEffect(() => {
    let cancelled = false; // StrictMode runs this twice in dev; the first stream must not outlive its cleanup
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("no camera access in this browser");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => setCameraError(err.message));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // a mode change clears any hold in progress
  useEffect(() => {
    holdRef.current = { since: {}, armed: {}, lastFired: {} };
  }, [mode]);

  useEffect(() => {
    if (!ready) return;
    let frameId;
    let lastVideoTime = -1;

    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const video = videoRef.current;
      const canvas = overlayRef.current;
      if (!video || !canvas || video.readyState < 2 || video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const now = performance.now();
      const p = propsRef.current;
      const handResult = gesture.recognizerRef.current.recognizeForVideo(video, now);

      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (MIRROR) ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
      // "Grab" lights a grabbing hand and draws its drag handle; "Pinch" only the two-finger band
      const grabbing = p.liveGestures.includes("Grab");
      const navigating = grabbing || p.liveGestures.includes("Pinch");
      const hands = drawHands(ctx, handResult, [...p.gestures, ...p.liveGestures], navigating, waveRef.current, now, grabbing);
      p.onHands?.(hands);
      const holding = updateHolds(hands, now, p);
      const v = p.viewRef?.current || {};
      if (navigating) drawNavigate(ctx, hands, now, v.scale || 1, grabbing, v.badge);
      const sky = p.skyOverlayRef?.current || {};
      if (p.live === "fly" && sky.fly) drawFly(ctx, sky.fly, now);
      if (p.live === "time" && sky.dial) drawDial(ctx, sky.dial);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // One caption slot at the bottom. What the user is doing wins over what
      // they are being asked to do.
      const firedAge = p.event ? now - p.event.at : Infinity;
      const action = (key) => p.controls.find((c) => c[2] === key)?.[1];
      if (firedAge < FIRED_MS) drawFired(ctx, p.event.label, firedAge);
      else if (holding) drawHolding(ctx, action(holding.name) || holding.name.replace("_", " "), holding.progress);
      else if (p.live === "time" && sky.dial) drawCaption(ctx, rateLabel(sky.dial.rate) || "Time ×1", ACTIVE);
      else if (p.live) drawCaption(ctx, p.liveLabel || LIVE_LABEL[p.live] || p.live, ACTIVE);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [ready]);

  // Fires held gestures and returns the hold in progress (the furthest
  // along, if several) as { name, progress }, or null. The filling caption
  // pill is the visual for the hold. A wave is a motion rather than a hold:
  // its progress is how much of the wave has happened, not time held.
  function updateHolds(hands, now, p) {
    const h = holdRef.current;
    let holding = null;
    for (const name of p.gestures) {
      const matched = matchHold(name, hands);
      if (!matched) {
        h.since[name] = null;
        h.armed[name] = false;
        continue;
      }
      if (h.since[name] == null) h.since[name] = now;
      const progress = name === WAVE ? matched[0].wave : Math.min(1, (now - h.since[name]) / HOLD_MS);
      if (!h.armed[name] && (!holding || progress > holding.progress)) holding = { name, progress };
      if (progress >= 1 && !h.armed[name] && now - (h.lastFired[name] || 0) > COOLDOWN_MS) {
        h.armed[name] = true;
        h.lastFired[name] = now;
        if (name === WAVE) waveRef.current.reset();
        p.onGesture?.(name);
      }
    }
    const heldName = holding?.name || null;
    if (heldName !== h.held) {
      h.held = heldName;
      setHeld(heldName);
    }
    return holding;
  }

  return (
    <div className="kiosk">
      <div className="viewfinder">
        {cameraError ? (
          <p className="camera-error">Camera unavailable: {cameraError}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className={MIRROR ? "mirrored" : ""} />
            <canvas ref={overlayRef} className="overlay" />
          </>
        )}
        {!ready && !cameraError && (
          <p className={`loading${gesture.error ? " failed" : ""}`}>
            <span className="dot" />
            {gesture.error || "Warming up"}
          </p>
        )}
      </div>
      <div className="legend">
        {hint && <p className="hint">{hint}</p>}
        {note && <p className="note">{note}</p>}
        {controls.length > 0 && (
          <dl className="controls">
            {controls.map(([does, action, key]) => (
              <div key={does} className={key && key === fired ? "fired" : key && (key === held || key === live) ? "held" : ""}>
                <dt><span className="key">{does}</span></dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

// Which hands the navigate overlays stand in for: the two pointing fingertips
// of a pinch, or the single grabbing hand. Their skeletons and labels are not
// drawn; the band or drag handle is the hand's representation.
function overlayHands(hands, grab = true) {
  const fingers = hands.filter((h) => h.gesture === "Pointing_Up" && h.score >= minScore("Pointing_Up"));
  if (fingers.length >= 2) return new Set(fingers.slice(0, 2));
  if (grab && hands.length === 1 && hands[0].gesture === "Grab") return new Set(hands);
  return new Set();
}

function drawHands(ctx, result, active, navigating = false, wave = null, now = 0, grab = true) {
  const { width, height } = ctx.canvas;
  const drawer = new DrawingUtils(ctx);
  const waving = wave && active.includes(WAVE);
  // classify first: the overlay set needs every hand's gesture
  const info = result.landmarks.map((landmarks, i) => {
    let g = result.gestures[i]?.[0];
    // Grab is not a stock gesture; it is detected from the landmarks and wins
    // over whatever the classifier said (it tends to call a grab a fist).
    if (isGrab(landmarks, width, height)) g = { categoryName: "Grab", score: 1 };
    // A wave is tracked over time, per hand (by handedness), from the middle
    // fingertip (12), which swings the most. It sits beside the classifier's
    // gesture rather than replacing it.
    const key = result.handedness?.[i]?.[0]?.categoryName || String(i);
    const open = isOpenHand(landmarks) || (g?.categoryName === "Open_Palm" && g.score >= minScore("Open_Palm"));
    const progress = waving ? wave.update(key, { t: now, x: landmarks[12].x * width, unit: handUnit(landmarks, width, height), open }) : 0;
    // landmark 9 is the palm centre, 8 the index fingertip; unit is the hand
    // size as a fraction of the frame width, a stand-in for how close it is
    return { hand: key, gesture: g?.categoryName || "None", score: g?.score || 0, wave: progress, x: landmarks[9].x * width, y: landmarks[9].y * height, nx: landmarks[9].x, ny: landmarks[9].y, ntx: landmarks[8].x, nty: landmarks[8].y, unit: handUnit(landmarks, width, height) / width };
  });
  const hidden = navigating ? overlayHands(info, grab) : new Set();
  result.landmarks.forEach((landmarks, i) => {
    if (hidden.has(info[i])) return;
    // a wave in progress labels the hand instead of the pose it is in
    const g = info[i].wave > 0 ? { categoryName: WAVE, score: info[i].wave } : info[i].gesture !== "None" ? { categoryName: info[i].gesture, score: info[i].score } : null;
    const activeNames = active.flatMap((n) => (n === TWO_PALMS ? ["Open_Palm"] : n === "Pinch" ? ["Pointing_Up"] : [n]));
    const isActive = g && (g.categoryName === WAVE || (activeNames.includes(g.categoryName) && g.score >= minScore(g.categoryName)));
    const color = isActive ? ACTIVE : IDLE;
    drawer.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color, lineWidth: Math.max(2, width / 400) });
    drawer.drawLandmarks(landmarks, { color: SCRIM, fillColor: color, lineWidth: 1, radius: Math.max(2, width / 300) });
    // label only a recognised gesture; a bare tracked hand stays quiet
    if (g) {
      const wrist = landmarks[0];
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const font = Math.max(13, width / 44);
      ctx.font = `600 ${font}px ${FONT}`;
      ctx.textAlign = "center";
      const label = `${g.categoryName.replace("_", " ")} ${Math.round(g.score * 100)}%`;
      const lx = MIRROR ? width - wrist.x * width : wrist.x * width;
      const ly = Math.min(wrist.y * height + font * 1.6, height - font * 0.6);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = SCRIM;
      ctx.beginPath();
      ctx.roundRect(lx - tw / 2 - font * 0.5, ly - font * 0.95, tw + font, font * 1.35, font * 0.7);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }
  });
  return info;
}

// Grab: index fingertip touching the thumb tip. Other fingers do not matter.
//   touching: index tip (8) within GRAB_REACH hand units of the thumb tip (4)
//   extended: index tip at least GRAB_CURL hand units from its knuckle (5),
//             in 3D, which rules out a fist (index curled back to the palm)
// A hand unit is the larger of palm length (wrist 0 to middle knuckle 9) and
// palm width (index knuckle 5 to pinky knuckle 17, scaled up to a palm length),
// so the unit does not collapse when the hand points at the camera.
// Measured in pixels so a wide frame does not distort the ratios.
const GRAB_REACH = 0.3;
const GRAB_CURL = 0.4;
const px = (lm, i, width, height) => ({ x: lm[i].x * width, y: lm[i].y * height, z: (lm[i].z || 0) * width });
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function handUnit(lm, width = 1, height = 1) {
  const p = (i) => px(lm, i, width, height);
  return Math.max(d2(p(0), p(9)), 1.7 * d2(p(5), p(17))) || 1;
}
export function isGrab(lm, width = 1, height = 1) {
  const p = (i) => px(lm, i, width, height);
  const unit = handUnit(lm, width, height);
  const touching = d2(p(8), p(4)) / unit < GRAB_REACH;
  const extended = d3(p(8), p(5)) / unit > GRAB_CURL;
  return touching && extended;
}

// Which hands satisfy a hold gesture right now, or null. Most holds are one
// hand, and a second hand in view cancels them; TWO_PALMS needs both hands
// showing Open_Palm; WAVE is whichever hand is furthest into a wave, and a
// second hand does not cancel it (people wave with one hand while the other
// hangs in view).
export const TWO_PALMS = "Two_Open_Palms";
export function matchHold(name, hands) {
  if (name === TWO_PALMS) {
    const palms = hands.filter((x) => x.gesture === "Open_Palm" && x.score >= minScore("Open_Palm"));
    return palms.length >= 2 ? palms.slice(0, 2) : null;
  }
  if (name === WAVE) {
    const hand = hands.reduce((best, x) => (x.wave > (best?.wave || 0) ? x : best), null);
    return hand ? [hand] : null;
  }
  if (hands.length >= 2) return null;
  const hand = hands.find((x) => x.gesture === name && x.score >= minScore(name));
  return hand ? [hand] : null;
}

// Navigate overlays, drawn in the mirrored frame. Two pointing fingertips
// zooming get an elastic band with the zoom factor at its midpoint (marching
// dashes so it reads as live); a single grabbing hand gets a drag handle:
// a dot on the pinch with four chevrons breathing around it. The badge is
// the zoom factor unless the caller gives its own text.
function drawNavigate(ctx, hands, now, scale, grab = true, badge = null) {
  const { width, height } = ctx.canvas;
  const overlay = [...overlayHands(hands, grab)];
  if (overlay.length >= 2) {
    const [a, b] = overlay;
    const ax = a.ntx * width, ay = a.nty * height;
    const bx = b.ntx * width, by = b.nty * height;
    const lw = Math.max(3, width / 260);
    ctx.save();
    ctx.strokeStyle = ACTIVE;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.setLineDash([lw * 2.5, lw * 3.5]);
    ctx.lineDashOffset = -now / 25;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [x, y] of [[ax, ay], [bx, by]]) {
      ctx.beginPath();
      ctx.arc(x, y, lw * 2, 0, Math.PI * 2);
      ctx.fillStyle = ACTIVE;
      ctx.fill();
      ctx.strokeStyle = SCRIM;
      ctx.lineWidth = lw / 2;
      ctx.stroke();
    }
    // zoom factor badge at the midpoint, upright
    const text = badge || `×${scale.toFixed(1)}`;
    const font = Math.max(14, width / 36);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `700 ${font}px ${FONT}`;
    ctx.textAlign = "center";
    const mx = MIRROR ? width - (ax + bx) / 2 : (ax + bx) / 2;
    const my = (ay + by) / 2;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = ACTIVE;
    ctx.beginPath();
    ctx.roundRect(mx - tw / 2 - font * 0.5, my - font * 0.85, tw + font, font * 1.5, font * 0.75);
    ctx.fill();
    ctx.fillStyle = "#0b0e1a";
    ctx.fillText(text, mx, my + font * 0.35);
    ctx.restore();
    return;
  }
  const hand = overlay[0] || null;
  if (!hand) return;
  const x = hand.ntx * width;
  const y = hand.nty * height;
  const r = Math.max(26, width / 18) * (1 + 0.06 * Math.sin(now / 180));
  const s = r * 0.28; // chevron arm length
  ctx.save();
  ctx.fillStyle = ACTIVE;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(4, width / 130), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ACTIVE;
  ctx.lineWidth = Math.max(3, width / 260);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < 4; i++) {
    const t = (i * Math.PI) / 2; // outward chevron at right, down, left, up
    const tipX = x + Math.cos(t) * r;
    const tipY = y + Math.sin(t) * r;
    ctx.beginPath();
    for (const spread of [-0.5, 0.5]) {
      ctx.moveTo(tipX - Math.cos(t + spread) * s, tipY - Math.sin(t + spread) * s);
      ctx.lineTo(tipX, tipY);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Overlay coordinates come from useViewGestures in sky space (mirrored); back
// to the video frame for drawing in the mirrored transform.
const toFrame = (x, width) => (MIRROR ? 1 - x : x) * width;

// Upright text with a scrim, drawn from inside the mirrored transform.
function uprightLabel(ctx, text, fx, fy, color = ACTIVE, size = 0) {
  const { width } = ctx.canvas;
  const font = size || Math.max(13, width / 40);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `700 ${font}px ${FONT}`;
  ctx.textAlign = "center";
  const x = MIRROR ? width - fx : fx;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = SCRIM;
  ctx.beginPath();
  ctx.roundRect(x - tw / 2 - font * 0.5, fy - font * 0.95, tw + font, font * 1.35, font * 0.7);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x, fy);
  ctx.restore();
}

// Fly: the palm as a joystick. A faint dead-zone ring where the palm first
// appeared, a dashed full-deflection ring, the stick from there to the palm
// now, and a dot on the palm that swells as the hand comes closer (pushing
// in) or shrinks as it goes back (pulling out).
function drawFly(ctx, fly, now) {
  const { width, height } = ctx.canvas;
  const x0 = toFrame(fly.x0, width), y0 = fly.y0 * height;
  const x = toFrame(fly.x, width), y = fly.y * height;
  const lw = Math.max(2, width / 320);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(245,197,66,0.45)";
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(x0, y0, FLY_DEAD * width, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([lw * 2, lw * 4]);
  ctx.lineDashOffset = -now / 40;
  ctx.beginPath();
  ctx.arc(x0, y0, FLY_FULL * width, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = ACTIVE;
  ctx.lineWidth = lw * 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x, y);
  ctx.stroke();
  const r = Math.max(8, width / 60) * (1 + 0.7 * fly.depth);
  ctx.fillStyle = ACTIVE;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = SCRIM;
  ctx.lineWidth = lw / 2;
  ctx.stroke();
  ctx.restore();
  if (Math.abs(fly.depth) > 0.05) uprightLabel(ctx, fly.depth > 0 ? "Push in" : "Pull out", x, y - r - Math.max(10, width / 50));
}

// Time dial: a vertical track beside the hand. The middle band is 1x, the
// top of the track is the fastest forward, the bottom the fastest rewind.
function drawDial(ctx, dial) {
  const { width, height } = ctx.canvas;
  const x = toFrame(dial.x, width) + (MIRROR ? -1 : 1) * width * 0.16;
  const top = (0.5 - DIAL_DEAD - DIAL_SPAN) * height;
  const bottom = (0.5 + DIAL_DEAD + DIAL_SPAN) * height;
  const y = Math.min(bottom, Math.max(top, dial.y * height));
  const lw = Math.max(3, width / 200);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(245,197,66,0.4)";
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.moveTo(x, (0.5 - DIAL_DEAD) * height);
  ctx.lineTo(x, (0.5 + DIAL_DEAD) * height);
  ctx.stroke();
  ctx.strokeStyle = ACTIVE;
  ctx.lineWidth = lw * 2;
  ctx.beginPath();
  ctx.moveTo(x, height / 2);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = ACTIVE;
  ctx.beginPath();
  ctx.arc(x, y, lw * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = SCRIM;
  ctx.lineWidth = lw / 2;
  ctx.stroke();
  ctx.restore();
  uprightLabel(ctx, "Faster", x, top - lw * 3, "rgba(255,255,255,0.85)");
  uprightLabel(ctx, "Rewind", x, bottom + lw * 6, "rgba(255,255,255,0.85)");
}

// Lower-third caption pill: the live sky mode, a hold in progress, or the
// control that just fired. Returns the pill rect for the variants below.
function captionRect(ctx, text, pad = 1) {
  const { width, height } = ctx.canvas;
  const font = Math.max(16, width / 28);
  ctx.font = `600 ${font}px ${FONT}`;
  const tw = Math.min(ctx.measureText(text).width, width - font * 2 - font * pad);
  const h = font * 1.9;
  const w = tw + font * (1 + pad);
  return { font, x: width / 2 - w / 2, y: height - h - font * 0.9, w, h, tw };
}

function drawCaption(ctx, text, color = "#fff") {
  const r = captionRect(ctx, text);
  ctx.fillStyle = SCRIM;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, r.x + r.w / 2, r.y + r.font * 1.3, r.tw);
  ctx.textAlign = "start";
}

// A gesture is being held: the pill fills left to right over HOLD_MS with
// what is about to happen.
function drawHolding(ctx, text, progress) {
  const r = captionRect(ctx, text);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fillStyle = SCRIM;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = ACTIVE;
  ctx.fillRect(r.x, r.y, r.w * progress, r.h);
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(text, r.x + r.w / 2, r.y + r.font * 1.3, r.tw);
  ctx.textAlign = "start";
}

// A control just fired: solid yellow pill with a tick, popping in then
// fading out over FIRED_MS.
function drawFired(ctx, text, age) {
  const r = captionRect(ctx, text, 2.2);
  const pop = Math.min(1, age / 120);
  const fade = age > FIRED_MS - 300 ? (FIRED_MS - age) / 300 : 1;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  ctx.translate(cx, cy);
  ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = ACTIVE;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fill();
  const t = r.font * 0.55; // tick size
  const tx = r.x + r.font * 0.9;
  ctx.strokeStyle = "#0b0e1a";
  ctx.lineWidth = Math.max(2.5, r.font / 7);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(tx, cy);
  ctx.lineTo(tx + t * 0.4, cy + t * 0.4);
  ctx.lineTo(tx + t, cy - t * 0.45);
  ctx.stroke();
  ctx.fillStyle = "#0b0e1a";
  ctx.textAlign = "center";
  ctx.fillText(text, r.x + r.w / 2 + r.font * 0.6, r.y + r.font * 1.3, r.tw);
  ctx.restore();
  ctx.textAlign = "start";
}
