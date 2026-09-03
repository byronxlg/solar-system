import { useCallback, useEffect, useRef, useState } from "react";
import SolarSystem from "./SolarSystem.jsx";
import Controls from "./Controls.jsx";
import { useCamera, rateLabel } from "./useCamera.js";
import { useViewGestures } from "./useViewGestures.js";
import { MIRROR } from "./Kiosk.jsx";
import { BODIES, YEAR_S, bodyPosition, pxPerUnit } from "./solar.js";
import AppSwitcher from "./AppSwitcher.jsx";

export default function App() {
  const camera = useCamera();
  const gestures = useViewGestures(camera);
  const [sky, setSky] = useState({ live: null, label: null }); // what the hands are doing to the sky right now
  const [mode, setMode] = useState("browse");
  const [timeLabel, setTimeLabel] = useState(null);
  const modeRef = useRef("browse");
  const sizeRef = useRef({ width: 800, height: 600 });

  function feedHands(hands, now) {
    const el = document.querySelector(".sky-wrap");
    if (el) sizeRef.current = { width: el.clientWidth, height: el.clientHeight };
    const m = modeRef.current;
    const r = m === "tour"
      ? { live: null, label: null }
      : gestures.handleHands(
          hands.map((h) => {
            const x = h.nx ?? h.x;
            const tx = h.ntx ?? x;
            return { gesture: h.gesture, score: h.score ?? 1, x: MIRROR ? 1 - x : x, y: h.ny ?? h.y, tipX: MIRROR ? 1 - tx : tx, tipY: h.nty ?? h.ny ?? h.y, unit: h.unit ?? 0.2 };
          }),
          sizeRef.current,
          now,
          m
        );
    setSky((prev) => (prev.live === r.live && prev.label === r.label ? prev : r));
  }

  const handleMode = useCallback((m) => {
    modeRef.current = m;
    setMode(m);
    gestures.clear();
    setSky((prev) => (prev.live === null && prev.label === null ? prev : { live: null, label: null }));
  }, [gestures]);

  // The time pill only re-renders when its text changes.
  const timeRef = useRef(null);
  const handleFrame = useCallback(() => {
    const label = rateLabel(camera.clockRef.current.rate);
    if (label !== timeRef.current) {
      timeRef.current = label;
      setTimeLabel(label);
    }
  }, [camera]);

  // dev hook: __view.hands([{gesture:"Grab",x:0.3,y:0.5}]) pans, two Pointing_Up hands zoom (fingertip defaults to x,y),
  // one Pointing_Up aims, one Open_Palm flies (unit = hand size, fraction of frame width), one Victory sets time
  useEffect(() => {
    window.__view = {
      hands: feedHands,
      reset: () => { camera.reset(); setSky({ live: null, label: null }); },
      focus: camera.setFocus,
      next: () => camera.step(1),
      prev: () => camera.step(-1),
      cam: () => ({ ...camera.camRef.current }),
      goal: () => ({ ...camera.goalRef.current }),
      focused: () => camera.focusRef.current,
      clock: () => ({ ...camera.clockRef.current }),
      pointer: () => (gestures.pointerRef.current ? { ...gestures.pointerRef.current } : null),
      overlay: () => ({ ...gestures.overlayRef.current }),
      // where body i is on the sky right now, in sky pixels
      screen: (i) => {
        const el = document.querySelector(".sky-wrap");
        const size = { width: el.clientWidth, height: el.clientHeight };
        const cam = camera.camRef.current;
        const clock = camera.clockRef.current;
        const p = bodyPosition(BODIES[i], clock.t, clock.loadedAt);
        const px = pxPerUnit(size, cam.scale);
        return { x: size.width / 2 + (p.x - cam.x) * px, y: size.height / 2 + (p.y - cam.y) * px, ...size };
      },
    };
  });

  const focused = camera.focus !== null ? BODIES[camera.focus] : null;
  const title = mode === "navigate" ? (sky.label || (sky.live ? `Navigate: ${sky.live}` : "Navigate")) : mode === "tour" ? "Tour" : sky.label || (focused ? focused.name : "Solar system");

  return (
    <div className="app">
      <div className="left">
        <SolarSystem camera={camera} mode={mode} pointerRef={gestures.pointerRef} onFrame={handleFrame} />
        <div className="sky-hud">
          <span className="pill">{title}</span>
          <span className={`pill faint${timeLabel ? " time" : ""}`}>{timeLabel || `1 Earth year = ${YEAR_S} s`}</span>
        </div>
        <AppSwitcher current="solar" />
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
      <Controls camera={camera} onHands={feedHands} live={sky.live} liveLabel={sky.label} overlayRef={gestures.overlayRef} onMode={handleMode} />
    </div>
  );
}
