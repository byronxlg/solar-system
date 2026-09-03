import { useCallback, useEffect, useRef, useState } from "react";
import GongStage from "./GongStage.jsx";
import Controls from "./Controls.jsx";
import { useGong } from "./useGong.js";
import { useStrikeGestures } from "./useStrikeGestures.js";
import { MIRROR } from "../Kiosk.jsx";
import { GONGS, MALLETS } from "./gongs.js";
import * as audio from "./audio.js";
import AppSwitcher from "../AppSwitcher.jsx";

export default function App() {
  const gong = useGong();
  const gestures = useStrikeGestures(gong);
  const [stage, setStage] = useState({ live: null, label: null }); // what the hands are doing to the gong right now
  const modeRef = useRef("play");

  function feedHands(hands, now) {
    const el = document.querySelector(".stage-wrap");
    const size = el ? { width: el.clientWidth, height: el.clientHeight } : gong.sizeRef.current;
    const r = gestures.handleHands(
      hands.map((h) => {
        const x = h.nx ?? h.x;
        const tx = h.ntx ?? x;
        return { hand: h.hand || "Right", gesture: h.gesture, score: h.score ?? 1, x: MIRROR ? 1 - x : x, y: h.ny ?? h.y, tipX: MIRROR ? 1 - tx : tx, tipY: h.nty ?? h.ny ?? h.y, unit: h.unit ?? 0.2 };
      }),
      size,
      now
    );
    setStage((prev) => (prev.live === r.live && prev.label === r.label ? prev : r));
  }

  const handleMode = useCallback((m) => {
    modeRef.current = m;
    gestures.clear();
    setStage((prev) => (prev.live === null && prev.label === null ? prev : { live: null, label: null }));
  }, [gestures]);

  // The first click or key anywhere wakes the audio; the browser needs one.
  useEffect(() => {
    const wake = () => gong.wake();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [gong]);

  // dev hook: __gong.strike(x, y, strength) in stage pixels, __gong.state()
  useEffect(() => {
    window.__gong = {
      strike: (x, y, strength = 0.7) => gong.strike({ x, y, strength, source: "dev" }),
      state: () => ({ ...gong.selRef.current, gong: GONGS[gong.selRef.current.gong].key, mallet: MALLETS[gong.selRef.current.mallet].key, cm: gong.cm, hits: gong.physRef.current.hits, lastHit: gong.physRef.current.lastHit, ringing: audio.ringing(), audio: audio.unlocked(), mode: modeRef.current }),
      phys: () => ({ ...gong.physRef.current }),
      mallets: () => Object.fromEntries(Object.entries(gong.malletsRef.current).map(([k, m]) => [k, { ...m }])),
      swings: () => Object.fromEntries(Object.entries(gestures.handsRef.current).map(([k, f]) => [k, { x: f.x, y: f.y, u: f.u, speed: f.speed, armed: f.armed }])),
      layout: () => {
        const el = document.querySelector(".stage-wrap");
        return { ...gong.sizeRef.current, ...(el ? { width: el.clientWidth, height: el.clientHeight } : {}) };
      },
      setGong: gong.setGong,
      setMallet: gong.setMallet,
      setSize: gong.setSize,
      damp: gong.damp,
      wake: gong.wake,
      level: audio.level,
      peak: audio.peak,
      hands: feedHands,
    };
    window.__view = { hands: feedHands };
  });

  const title = `${gong.gong.name} · ${gong.cm} cm`;
  const sub = stage.label || `${gong.mallet.name}${gong.hits ? ` · ${gong.hits} ${gong.hits === 1 ? "hit" : "hits"}` : ""}`;

  return (
    <div className="app gong-app">
      <div className="left">
        <GongStage gong={gong} />
        <div className="sky-hud">
          <span className="pill">{title}</span>
          <span className={`pill faint${stage.live === "strike" ? " live" : ""}`}>{sub}</span>
        </div>
        <AppSwitcher current="gong" />
        {!gong.audioOn && (
          <button className="wake" onClick={() => gong.wake()}>
            <span className="dot" />Tap anywhere to wake the gong's sound
          </button>
        )}
        <article className="card" key={gong.gong.key + gong.mallet.key}>
          <header>
            <span className="swatch" style={{ "--body": gong.gong.color }} />
            <div>
              <h2>{gong.gong.name}</h2>
              <p className="tagline">{gong.gong.tagline}</p>
            </div>
          </header>
          <dl>
            {Object.entries(gong.gong.facts).map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
            <div><dt>Mallet</dt><dd>{gong.mallet.name}</dd></div>
          </dl>
          <p className="note">{gong.gong.note} {gong.mallet.note}</p>
        </article>
      </div>
      <Controls gong={gong} onHands={feedHands} live={stage.live} liveLabel={stage.label} overlayRef={gestures.overlayRef} onMode={handleMode} />
    </div>
  );
}
