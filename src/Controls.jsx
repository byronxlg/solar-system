import { useEffect, useRef, useState } from "react";
import Kiosk, { TWO_PALMS } from "./Kiosk.jsx";
import { WAVE } from "./wave.js";
import { BODIES, YEAR_S } from "./solar.js";

// Journey with no buttons: gestures only. Browsing is the default; the tour
// returns to browsing on its own when it ends.
//   browse    main view; two Open Palms (held) -> navigate, Thumb Up/Down (held) -> next/previous body,
//             a wave -> tour, Closed Fist (held) -> back to the whole system
//   navigate  grab pans, pinch zooms; Closed Fist (held) -> browse
//   tour      flies from body to body every TOUR_MS; Thumb Up (held) skips ahead, Closed Fist (held) stops
export const TOUR_MS = 9000;
const KEYS = { ArrowRight: "Thumb_Up", ArrowLeft: "Thumb_Down", n: TWO_PALMS, t: WAVE, Escape: "Closed_Fist" };

// Per mode: the situational line (hint), and one [you do, it does, key] row
// per control, shown in the legend under the camera. `key` is the held
// gesture or the live sky mode ("pan"/"zoom") the row stands for, so the
// kiosk can light the row and caption the video while it happens.
export const ACCENT = { sea: "#3b7fc4", teal: "#2f8f83", amber: "#d9931f" };
const UI = {
  browse: {
    title: "Main view", color: ACCENT.sea,
    hint: "Show a hand to the camera",
    controls: [
      ["Hold a thumb up", "Fly to the next planet", "Thumb_Up"],
      ["Hold a thumb down", "Fly to the previous planet", "Thumb_Down"],
      ["Hold two open palms", "Navigate freely", TWO_PALMS],
      ["Wave a hand", "Take the tour", WAVE],
      ["Hold a fist", "Back to the whole system", "Closed_Fist"],
    ],
    gestures: [WAVE, TWO_PALMS, "Thumb_Up", "Thumb_Down", "Closed_Fist"],
  },
  navigate: {
    title: "Navigate", color: ACCENT.teal,
    hint: "Move the sky with your hand",
    controls: [
      ["Touch index and thumb, move", "Pan", "pan"],
      ["Pinch two pointed fingers", "Zoom", "zoom"],
      ["Hold a fist", "Back to main view", "Closed_Fist"],
    ],
    gestures: ["Closed_Fist"],
  },
  tour: {
    title: "Tour", color: ACCENT.amber,
    controls: [
      ["Hold a thumb up", "Skip ahead", "Thumb_Up"],
      ["Hold a fist", "Stop the tour", "Closed_Fist"],
    ],
    gestures: ["Thumb_Up", "Closed_Fist"],
  },
};

// camera: from useCamera. onHands: per-frame hands while navigating.
export default function Controls({ camera, onHands, skyMode = null, onMode }) {
  const [mode, setMode] = useState("browse");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const uiRef = useRef(UI.browse);
  const [event, setEvent] = useState(null); // { key, label, at }: the control that just fired, for the kiosk's feedback
  const tourRef = useRef(null);

  useEffect(() => {
    onMode?.(mode);
  }, [mode, onMode]);

  // The label is captured at fire time: firing usually changes the mode, and
  // the next mode's controls no longer contain the row.
  function fire(key) {
    const row = uiRef.current.controls.find((c) => c[2] === key);
    if (row) setEvent({ key, label: row[1], at: performance.now() });
  }

  // Tour: start at the Sun and step every TOUR_MS; after Neptune, back to the
  // overview and to browsing.
  useEffect(() => {
    if (mode !== "tour") {
      clearInterval(tourRef.current);
      return;
    }
    camera.setFocus(0);
    tourRef.current = setInterval(() => tourStep(), TOUR_MS);
    return () => clearInterval(tourRef.current);
  }, [mode]);

  function tourStep() {
    const cur = camera.focusRef.current;
    if (cur === null || cur >= BODIES.length - 1) {
      camera.reset();
      setMode("browse");
      return;
    }
    camera.setFocus(cur + 1);
    // restart the clock so a skip gets a full stay
    clearInterval(tourRef.current);
    tourRef.current = setInterval(() => tourStep(), TOUR_MS);
  }

  // Convention: thumb up moves on, a wave starts the tour, closed fist goes back.
  function handleGesture(g) {
    const m = modeRef.current;
    fire(g);
    if (m === "browse") {
      if (g === "Thumb_Up") return camera.step(1);
      if (g === "Thumb_Down") return camera.step(-1);
      if (g === TWO_PALMS) return setMode("navigate");
      if (g === WAVE) return setMode("tour");
      if (g === "Closed_Fist") return camera.reset();
      return;
    }
    if (m === "navigate") {
      if (g === "Closed_Fist") return setMode("browse");
      return;
    }
    if (m === "tour") {
      if (g === "Thumb_Up") return tourStep();
      if (g === "Closed_Fist") {
        camera.reset();
        return setMode("browse");
      }
    }
  }

  // dev hook: drive the flow from the console or tests, e.g. __kiosk.gesture("Thumb_Up")
  useEffect(() => {
    window.__kiosk = { mode, gesture: handleGesture, setMode };
  });

  // Keyboard fallback for a machine without a camera: each key stands in for
  // one gesture and goes through the same handler.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const g = KEYS[e.key];
      if (!g) return;
      e.preventDefault();
      handleGesture(g);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ui = UI[mode];
  uiRef.current = ui;
  const focused = camera.focus !== null ? BODIES[camera.focus] : null;
  const hint = mode === "tour" ? (focused ? `Now passing ${focused.kind === "star" ? "the Sun" : focused.name}` : "Heading home") : mode === "browse" && focused ? `At ${focused.kind === "star" ? "the Sun" : focused.name}` : ui.hint;
  const note = mode === "tour" ? "Nine stops, from the Sun out to Neptune." : mode === "browse" && focused ? focused.tagline : null;

  return (
    <aside className="panel" style={{ "--accent": ui.color }}>
      <header className="kiosk-head">
        <h1 className="mode"><span className="dot" />{ui.title}</h1>
        {(mode === "tour" || (mode === "browse" && focused)) && (
          <ol className="stops">
            {BODIES.map((b, i) => (
              <li key={b.key} className={i === camera.focus ? "current" : ""} title={b.name}>
                <span className="pip" style={{ "--body": b.color }} />
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
        onGesture={handleGesture}
        onHands={(hands) => mode === "navigate" && onHands?.(hands)}
        live={mode === "navigate" ? skyMode : null}
        viewRef={camera.goalRef}
        event={event}
      />

      <p className="foot">Planets sit where they really are today and move on from there, an Earth year every {YEAR_S} seconds. Orbits are circular; sizes and distances are compressed so everything fits on one screen.</p>
    </aside>
  );
}
