import { useEffect, useRef, useState } from "react";
import Kiosk, { TWO_PALMS } from "../Kiosk.jsx";
import { GONGS, MALLETS } from "./gongs.js";
import { layout } from "./useGong.js";

// Gestures only, no buttons. Playing is the whole of the main screen: a
// swinging arm strikes, an open palm damps, and one gesture opens the
// settings. Everything that changes the gong lives behind it, and nothing
// strikes there, so setting up and banging never mix. A closed fist is the
// way back, as it is in the sky.
//   play    a swinging arm strikes the centre; Open Palm (held) -> damp;
//           Victory (held) -> adjust
//   adjust  Thumb Up/Down (held) -> next/previous gong, Victory (held) -> next mallet,
//           two pointed fingers pinching -> resize, two Open Palms (held) -> gong bath,
//           Closed Fist (held) -> back to play. No strikes.
//   bath    the gong plays itself; an arm still strikes; Thumb Up (held) -> next gong,
//           Open Palm (held) -> damp, Closed Fist (held) -> stop, back to play
// Not a wave anywhere: swinging at the gong twice is a wave.
// A hold only counts while the hand is still (STILL_HOLD), so an arm mid-swing
// with an open hand or a fist never damps or leaves the mode by accident.
const STILL_HOLD = 0.5; // frame widths per second
export const BATH_MIN_MS = 1800;
export const BATH_MAX_MS = 4200;

export const ACCENT = { bronze: "#b4732f", teal: "#2f8f83", indigo: "#4b5bb5" };
const UI = {
  play: {
    title: "Play", color: ACCENT.bronze,
    hint: "Swing an arm to strike the gong",
    controls: [
      ["Swing an arm", "Strike the centre. Faster is louder", "strike"],
      ["Hold an open palm", "Damp it", "Open_Palm"],
      ["Hold two fingers up", "Adjust the gong and mallet", "Victory"],
    ],
    gestures: ["Victory", "Open_Palm"],
    live: [],
  },
  adjust: {
    title: "Adjust", color: ACCENT.teal,
    hint: "Set up the gong",
    controls: [
      ["Hold a thumb up", "Next gong", "Thumb_Up"],
      ["Hold a thumb down", "Previous gong", "Thumb_Down"],
      ["Hold two fingers up", "Next mallet", "Victory"],
      ["Pinch two pointed fingers", "Resize the gong", "resize"],
      ["Hold two open palms", "Gong bath", TWO_PALMS],
      ["Hold a closed fist", "Back to playing", "Closed_Fist"],
    ],
    gestures: [TWO_PALMS, "Thumb_Up", "Thumb_Down", "Victory", "Closed_Fist"],
    live: ["Pinch"],
  },
  bath: {
    title: "Gong bath", color: ACCENT.indigo,
    hint: "The gong plays itself",
    controls: [
      ["Swing an arm", "Join in", "strike"],
      ["Hold a thumb up", "Next gong", "Thumb_Up"],
      ["Hold an open palm", "Damp it", "Open_Palm"],
      ["Hold a closed fist", "Stop the bath", "Closed_Fist"],
    ],
    gestures: ["Thumb_Up", "Open_Palm", "Closed_Fist"],
    live: [],
  },
};

// gong: from useGong. onHands / onPose: per-frame hands and body. live /
// liveLabel: what the stage is doing right now. overlayRef: { scale, badge,
// swing } for the resize band and the wrist rings.
export default function Controls({ gong, onHands, onPose, live = null, liveLabel = null, overlayRef = null, onMode }) {
  const [mode, setMode] = useState("play");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const uiRef = useRef(UI.play);
  const [event, setEvent] = useState(null); // { key, label, at }: the control that just fired
  const bathRef = useRef(null);

  useEffect(() => {
    onMode?.(mode);
  }, [mode, onMode]);

  function fire(key) {
    const row = uiRef.current.controls.find((c) => c[2] === key);
    if (row) setEvent({ key, label: row[1], at: performance.now() });
  }

  // The bath: gentle strikes at a slow, uneven pace, wandering over the
  // plate. Mostly soft, every fourth a little louder, now and then a roll of
  // three quick soft hits or a pair. Every eighth strike moves to the next
  // gong, and the mallet changes with it so each gong gets a fresh voice.
  useEffect(() => {
    if (mode !== "bath") {
      clearTimeout(bathRef.current);
      return;
    }
    let count = 0;
    let roll = 0; // quick hits left in a roll
    let wander = Math.random() * Math.PI * 2; // the hits drift around the plate
    const step = () => {
      const size = gong.sizeRef.current;
      const { cx, cy, R } = layout(gong.selRef.current.size, size);
      wander += (Math.random() - 0.5) * 1.4;
      const r = roll ? 0.55 + Math.random() * 0.3 : Math.sqrt(Math.random()) * 0.8;
      const accent = count % 4 === 3;
      const strength = roll ? 0.18 + Math.random() * 0.12 : accent ? 0.5 + Math.random() * 0.3 : 0.22 + Math.random() * 0.25;
      gong.strike({ x: cx + Math.cos(wander) * r * R, y: cy + Math.sin(wander) * r * R, strength, source: "bath", id: "bath" });
      if (roll) roll -= 1;
      else {
        count += 1;
        if (count % 8 === 0) {
          gong.stepGong(1);
          gong.stepMallet(1);
        }
        const dice = Math.random();
        if (dice < 0.12) roll = 2;
        else if (dice < 0.3) roll = 1;
      }
      bathRef.current = setTimeout(step, roll ? 160 + Math.random() * 120 : BATH_MIN_MS + Math.random() * (BATH_MAX_MS - BATH_MIN_MS));
    };
    bathRef.current = setTimeout(step, 400);
    return () => clearTimeout(bathRef.current);
  }, [mode, gong]);

  function handleGesture(g) {
    const m = modeRef.current;
    fire(g);
    if (m === "play") {
      if (g === "Open_Palm") return gong.damp();
      if (g === "Victory") return setMode("adjust");
      return;
    }
    if (m === "adjust") {
      if (g === "Thumb_Up") return gong.stepGong(1);
      if (g === "Thumb_Down") return gong.stepGong(-1);
      if (g === "Victory") return gong.stepMallet(1);
      if (g === TWO_PALMS) return setMode("bath");
      if (g === "Closed_Fist") return setMode("play");
      return;
    }
    if (m === "bath") {
      if (g === "Thumb_Up") return gong.stepGong(1);
      if (g === "Open_Palm") return gong.damp();
      if (g === "Closed_Fist") {
        gong.damp();
        return setMode("play");
      }
    }
  }

  // dev hook: drive the flow from the console or tests, e.g. __kiosk.gesture("Thumb_Up")
  useEffect(() => {
    window.__kiosk = { mode, gesture: handleGesture, setMode };
  });

  // Keyboard fallback for a machine without a camera. The keys act
  // directly, in any mode: Space strikes near the centre, the arrows change
  // the gong, s the mallet, + and - resize, m damps, a opens and closes
  // Adjust, b starts the bath, Esc goes back to playing.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      gong.wake();
      const m = modeRef.current;
      const act = (key, fn) => {
        e.preventDefault();
        fire(key);
        fn();
      };
      if (e.key === " ") {
        e.preventDefault();
        const size = gong.sizeRef.current;
        const { cx, cy, R } = layout(gong.selRef.current.size, size);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.35;
        gong.strike({ x: cx + Math.cos(a) * r * R, y: cy + Math.sin(a) * r * R, strength: 0.5 + Math.random() * 0.4, source: "key" });
        return;
      }
      if (e.key === "ArrowRight") return act("Thumb_Up", () => gong.stepGong(1));
      if (e.key === "ArrowLeft") return act("Thumb_Down", () => gong.stepGong(-1));
      if (e.key === "s") return act("Victory", () => gong.stepMallet(1));
      if (e.key === "+" || e.key === "=") return act("resize", () => gong.scaleSize(1.12));
      if (e.key === "-" || e.key === "_") return act("resize", () => gong.scaleSize(1 / 1.12));
      if (e.key === "m") return act("Open_Palm", () => gong.damp());
      if (e.key === "a") return act(m === "play" ? "Victory" : "Closed_Fist", () => setMode(m === "adjust" ? "play" : "adjust"));
      if (e.key === "b") return act(TWO_PALMS, () => setMode("bath"));
      if (e.key === "Escape") return act("Closed_Fist", () => { if (m === "bath") gong.damp(); setMode("play"); });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ui = UI[mode];
  uiRef.current = ui;
  const hint = liveLabel || (mode === "bath" ? `${gong.gong.name} plays itself` : ui.hint);
  const note = mode === "bath"
    ? `Slow, soft strikes with the ${gong.mallet.name.toLowerCase()}. Every eighth one moves to the next gong and mallet.`
    : mode === "adjust"
      ? `${gong.gong.name}, ${gong.cm} cm, with the ${gong.mallet.name.toLowerCase()}. ${gong.gong.tagline}.`
      : `${gong.gong.name}, ${gong.cm} cm, with the ${gong.mallet.name.toLowerCase()}.`;

  return (
    <aside className="panel" style={{ "--accent": ui.color }}>
      <header className="kiosk-head">
        <h1 className="mode"><span className="dot" />{ui.title}</h1>
        {mode !== "play" && (
          <ol className="stops" aria-label="Gongs">
            {GONGS.map((g, i) => (
              <li key={g.key} className={i === gong.gongIndex ? "current" : ""} title={g.name}>
                <span className="pip" style={{ "--body": g.color }} />
              </li>
            ))}
          </ol>
        )}
      </header>

      <Kiosk
        mode={mode}
        color={ui.color}
        hint={hint}
        note={note}
        controls={ui.controls}
        gestures={ui.gestures}
        liveGestures={ui.live}
        onGesture={handleGesture}
        onHands={onHands}
        pose
        onPose={onPose}
        stillHolds={STILL_HOLD}
        live={live}
        liveLabel={liveLabel}
        viewRef={overlayRef}
        event={event}
      />

      <p className="foot">No camera? Click or tap the gong to strike it, drag across it to swing, scroll to resize. Space strikes, a opens and closes Adjust, the arrow keys change the gong, s the mallet, m damps, b starts the bath, Esc goes back. {MALLETS.length} mallets, {GONGS.length} gongs.</p>
    </aside>
  );
}
