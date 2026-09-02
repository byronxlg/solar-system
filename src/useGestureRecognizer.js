import { useEffect, useRef, useState } from "react";
import { GestureRecognizer, FilesetResolver } from "@mediapipe/tasks-vision";
import { NO_MODELS, STUB_GESTURE_RECOGNIZER } from "./devFlags.js";

// Both live under the site base so the same code runs on the dev server and
// on GitHub Pages: the wasm runtime is copied to public/wasm by
// scripts/copy-wasm.mjs, the model is committed in public/models.
const WASM_PATH = `${import.meta.env.BASE_URL}wasm`;
// Stock model: palm detector + 21 hand landmarks + classifier for
// Closed_Fist, Open_Palm, Pointing_Up, Thumb_Down, Thumb_Up, Victory, ILoveYou.
const MODEL_PATH = `${import.meta.env.BASE_URL}models/gesture_recognizer.task`;

export function useGestureRecognizer() {
  const recognizerRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (NO_MODELS) {
      recognizerRef.current = STUB_GESTURE_RECOGNIZER;
      setStatus("ready");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
        });
        if (cancelled) {
          recognizer.close();
          return;
        }
        recognizerRef.current = recognizer;
        setStatus("ready");
      } catch (err) {
        setError(err.message);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      recognizerRef.current?.close();
      recognizerRef.current = null;
    };
  }, []);

  return { recognizerRef, status, error };
}
