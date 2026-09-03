import { useEffect, useRef, useState } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { NO_MODELS, STUB_POSE_LANDMARKER } from "./devFlags.js";

// The body model, for apps that read arm swings (the gong). Same layout as
// the gesture recogniser: the wasm runtime under public/wasm, the model
// committed in public/models. The lite model is enough for wrists and
// shoulders and it is the cheapest to run beside the hand model.
const WASM_PATH = `${import.meta.env.BASE_URL}wasm`;
const MODEL_PATH = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;

// Landmark indices worth knowing (MediaPipe's 33-point body).
export const POSE = { nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16, lHip: 23, rHip: 24 };

// enabled=false leaves the model unloaded and reports "off", so a kiosk
// that does not need a body pays nothing for it.
export function usePoseLandmarker(enabled = true) {
  const landmarkerRef = useRef(null);
  const [status, setStatus] = useState(enabled ? "loading" : "off");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    if (NO_MODELS) {
      landmarkerRef.current = STUB_POSE_LANDMARKER;
      setStatus("ready");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setStatus("ready");
      } catch (err) {
        setError(err.message);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [enabled]);

  return { landmarkerRef, status, error };
}
