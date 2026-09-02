import { useCallback, useEffect, useRef, useState } from "react";
import SolarSystem from "./SolarSystem.jsx";
import Controls from "./Controls.jsx";
import { useCamera } from "./useCamera.js";
import { useViewGestures } from "./useViewGestures.js";
import { MIRROR } from "./Kiosk.jsx";
import { BODIES, YEAR_S } from "./solar.js";

export default function App() {
  const camera = useCamera();
  const gestures = useViewGestures(camera);
  const [skyMode, setSkyMode] = useState(null); // "pan" | "zoom" | null while navigating
  const [mode, setMode] = useState("browse");
  const sizeRef = useRef({ width: 800, height: 600 });

  function feedHands(hands, now) {
    const el = document.querySelector(".sky-wrap");
    if (el) sizeRef.current = { width: el.clientWidth, height: el.clientHeight };
    const m = gestures.handleHands(
      hands.map((h) => {
        const x = h.nx ?? h.x;
        const tx = h.ntx ?? x;
        return { gesture: h.gesture, score: h.score ?? 1, x: MIRROR ? 1 - x : x, y: h.ny ?? h.y, tipX: MIRROR ? 1 - tx : tx, tipY: h.nty ?? h.ny ?? h.y };
      }),
      sizeRef.current,
      now
    );
    setSkyMode((prev) => (prev === m ? prev : m));
  }

  const handleMode = useCallback((m) => {
    setMode(m);
    if (m !== "navigate") {
      gestures.clear();
      setSkyMode(null);
    }
  }, [gestures]);

  // dev hook: __view.hands([{gesture:"Grab",x:0.3,y:0.5}]) pans, two Pointing_Up hands zoom (fingertip defaults to x,y)
  useEffect(() => {
    window.__view = {
      hands: feedHands,
      reset: () => { camera.reset(); setSkyMode(null); },
      focus: camera.setFocus,
      next: () => camera.step(1),
      prev: () => camera.step(-1),
      cam: () => ({ ...camera.camRef.current }),
      goal: () => ({ ...camera.goalRef.current }),
      focused: () => camera.focusRef.current,
    };
  });

  const focused = camera.focus !== null ? BODIES[camera.focus] : null;

  return (
    <div className="app">
      <div className="left">
        <SolarSystem camera={camera} mode={mode} />
        <div className="sky-hud">
          <span className="pill">{mode === "navigate" ? (skyMode ? `Navigate: ${skyMode}` : "Navigate") : mode === "tour" ? "Tour" : focused ? focused.name : "Solar system"}</span>
          <span className="pill faint">1 Earth year = {YEAR_S} s</span>
        </div>
        {focused && mode !== "navigate" && (
          <article className="card" key={focused.key}>
            <header>
              <span className="swatch" style={{ "--body": focused.color }} />
              <div>
                <h2>{focused.name}</h2>
                <p className="tagline">{focused.tagline}</p>
              </div>
            </header>
            <dl>
              {Object.entries(focused.facts).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            <p className="note">{focused.note}</p>
          </article>
        )}
      </div>
      <Controls camera={camera} onHands={feedHands} skyMode={skyMode} onMode={handleMode} />
    </div>
  );
}
