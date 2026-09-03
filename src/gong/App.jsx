import { useCallback, useEffect, useRef, useState } from "react";
import GongStage from "./GongStage.jsx";
import Controls from "./Controls.jsx";
import { useGong, layout } from "./useGong.js";
import { useStrikeGestures } from "./useStrikeGestures.js";
import { MIRROR } from "../Kiosk.jsx";
import { GONGS, MALLETS } from "./gongs.js";
import * as audio from "./audio.js";
import AppSwitcher from "../AppSwitcher.jsx";

export default function App() {
  const gong = useGong();
  const gestures = useStrikeGestures(gong);
  const [stage, setStage] = useState({ live: null, label: null }); // what the body and hands are doing to the gong right now
  const [mode, setMode] = useState("play");
  const modeRef = useRef("play");
  const liveRef = useRef({ hands: null, pose: null }); // the latest from each source; a resize wins over a swing
  const presenceRef = useRef(0); // when a body or a hand was last in view; Play ends when that goes stale

  function stageSize() {
    const el = document.querySelector(".stage-wrap");
    return el ? { width: el.clientWidth, height: el.clientHeight } : gong.sizeRef.current;
  }
  function showStage() {
    const r = liveRef.current.hands || liveRef.current.pose || { live: null, label: null };
    setStage((prev) => (prev.live === r.live && prev.label === r.label ? prev : r));
  }

  function feedHands(hands, now) {
    if (hands.length) presenceRef.current = now;
    liveRef.current.hands = gestures.handleHands(
      hands.map((h) => {
        const x = h.nx ?? h.x;
        const tx = h.ntx ?? x;
        return { hand: h.hand || "Right", gesture: h.gesture, score: h.score ?? 1, x: MIRROR ? 1 - x : x, y: h.ny ?? h.y, tipX: MIRROR ? 1 - tx : tx, tipY: h.nty ?? h.ny ?? h.y, unit: h.unit ?? 0.2 };
      }),
      stageSize(),
      now,
      modeRef.current
    );
    showStage();
  }

  // body: { left, right, leftElbow, rightElbow, unit, x, y } from the kiosk
  // (joints in raw frame coords with a world position in metres), or null
  function feedPose(body, now) {
    if (body) presenceRef.current = now;
    const joint = (j) => (j ? { x: MIRROR ? 1 - j.x : j.x, y: j.y, z: j.z || 0, vis: j.vis ?? 1, world: j.world } : null);
    liveRef.current.pose = gestures.handlePose(body ? { left: joint(body.left), right: joint(body.right), leftElbow: joint(body.leftElbow), rightElbow: joint(body.rightElbow), unit: body.unit } : null, stageSize(), now, modeRef.current);
    showStage();
  }

  const handleMode = useCallback((m) => {
    modeRef.current = m;
    setMode(m);
    gestures.clear();
    liveRef.current = { hands: null, pose: null };
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

  // dev hook: __gong.strike(x, y, strength) in stage pixels, __gong.state(),
  // __gong.swings() for each arm's speed; __view.hands / __view.body feed a
  // frame in by hand
  useEffect(() => {
    window.__gong = {
      ...(window.__gong || {}), // the stage adds its own (pointer)
      strike: (x, y, strength = 0.7) => gong.strike({ x, y, strength, source: "dev" }),
      state: () => ({ ...gong.selRef.current, gong: GONGS[gong.selRef.current.gong].key, mallet: MALLETS[gong.selRef.current.mallet].key, cm: gong.cm, hits: gong.physRef.current.hits, lastHit: gong.physRef.current.lastHit, ringing: audio.ringing(), audio: audio.unlocked(), mode: modeRef.current }),
      phys: () => ({ ...gong.physRef.current }),
      mallets: () => Object.fromEntries(Object.entries(gong.malletsRef.current).map(([k, m]) => [k, { ...m, trail: undefined }])),
      swings: () => Object.fromEntries(Object.entries(gestures.armsRef.current).map(([k, f]) => [k, { speed: f.speed, peak: f.peak, travel: f.travel, armed: f.armed }])),
      presence: () => presenceRef.current,
      layout: () => {
        const el = document.querySelector(".stage-wrap");
        return { ...gong.sizeRef.current, ...(el ? { width: el.clientWidth, height: el.clientHeight } : {}) };
      },
      geo: () => layout(gong.selRef.current.size, gong.sizeRef.current),
      setGong: gong.setGong,
      setMallet: gong.setMallet,
      setSize: gong.setSize,
      damp: gong.damp,
      wake: gong.wake,
      level: audio.level,
      peak: audio.peak,
      hands: feedHands,
      body: feedPose,
    };
    window.__view = { hands: feedHands, body: feedPose };
  });

  const title = `${gong.gong.name} · ${gong.cm} cm`;
  const sub = stage.label || `${gong.mallet.name}${gong.hits ? ` · ${gong.hits} ${gong.hits === 1 ? "hit" : "hits"}` : ""}${gong.best ? ` · loudest ${Math.round(gong.best * 100)}%` : ""}`;

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
        {mode !== "play" && (
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
        )}
      </div>
      <Controls gong={gong} onHands={feedHands} onPose={feedPose} presenceRef={presenceRef} live={stage.live} liveLabel={stage.label} overlayRef={gestures.overlayRef} onMode={handleMode} />
    </div>
  );
}
