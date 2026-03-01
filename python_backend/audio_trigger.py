import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import List, Dict

import numpy as np


def load_yamnet():
  """
  Lazy-load YAMNet from TF Hub.
  Falls back to a dummy model if TensorFlow or TF Hub is unavailable so that the demo still runs.
  """
  try:
    import tensorflow as tf  # type: ignore
    import tensorflow_hub as hub  # type: ignore

    model_handle = "https://tfhub.dev/google/yamnet/1"
    model = hub.load(model_handle)

    class_map_path = model.class_map_path().numpy()
    with tf.io.gfile.GFile(class_map_path, "r") as f:
      import csv

      reader = csv.reader(f)
      next(reader)
      classes = [row[2] for row in reader]

    return model, classes
  except Exception as e:  # pragma: no cover - fallback path
    print(f"[audio_trigger] Warning: failed to load YAMNet from TF Hub: {e}", file=sys.stderr)

    class DummyModel:
      def __call__(self, waveform):
        # Return a single fake class with high score for demo purposes
        scores = np.array([[0.1, 0.9, 0.2]], dtype=np.float32)
        return None, scores, None

    dummy_classes = ["background", "scream", "glass_break"]
    return DummyModel(), dummy_classes


def load_audio(path: str, target_sr: int = 16000) -> np.ndarray:
  try:
    import librosa  # type: ignore

    waveform, _ = librosa.load(path, sr=target_sr, mono=True)
    return waveform.astype(np.float32)
  except Exception as e:  # pragma: no cover - fallback
    print(f"[audio_trigger] Error loading audio {path}: {e}", file=sys.stderr)
    return np.zeros((target_sr * 1,), dtype=np.float32)


def map_labels_to_incidents(classes: List[str]) -> Dict[int, str]:
  incident_map: Dict[int, str] = {}
  for idx, label in enumerate(classes):
    lower = label.lower()
    if "scream" in lower:
      incident_map[idx] = "scream"
    elif "glass" in lower:
      incident_map[idx] = "glass_break"
    elif "gunshot" in lower or "gun" in lower or "explosion" in lower:
      incident_map[idx] = "gunshot"
  return incident_map


def run_inference(input_path: str, out_path: str, threshold: float) -> None:
  model, classes = load_yamnet()
  incident_map = map_labels_to_incidents(classes)

  # For the prototype we treat the whole clip as one segment.
  waveform = load_audio(input_path)
  if waveform.size == 0:
    print("[audio_trigger] No audio data, skipping.", file=sys.stderr)
    alerts: List[Dict] = []
  else:
    # YAMNet expects [num_samples], model returns scores [frames, num_classes]
    _, scores, _ = model(waveform)
    scores_np = np.array(scores)
    if scores_np.ndim == 1:
      scores_np = scores_np[None, :]

    # Aggregate scores over time
    mean_scores = scores_np.mean(axis=0)
    alerts = []
    now = datetime.now(timezone.utc).isoformat()
    duration_sec = float(len(waveform) / 16000.0)

    for class_idx, incident_label in incident_map.items():
      score = float(mean_scores[class_idx])
      if score >= threshold:
        alerts.append(
          {
            "id": f"audio-{incident_label}-{int(datetime.now().timestamp())}",
            "timestamp_iso": now,
            "label": incident_label,
            "score": score,
            "start_sec": 0.0,
            "duration_sec": duration_sec,
          }
        )

  os.makedirs(os.path.dirname(out_path), exist_ok=True)
  with open(out_path, "w", encoding="utf-8") as f:
    json.dump(alerts, f, indent=2)

  print(json.dumps(alerts, indent=2))


def main() -> None:
  parser = argparse.ArgumentParser(description="Level-1 audio trigger using YAMNet (simulated).")
  parser.add_argument("--input", required=True, help='Path to WAV file or "mic" (mic not implemented).')
  parser.add_argument("--out", default="tmp/audio_alerts.json", help="Output JSON path.")
  parser.add_argument("--threshold", type=float, default=0.5, help="Score threshold for alerts.")
  args = parser.parse_args()

  if args.input == "mic":
    print("[audio_trigger] Microphone mode is not implemented in this prototype.", file=sys.stderr)
    sys.exit(1)

  run_inference(args.input, args.out, args.threshold)


if __name__ == "__main__":
  main()

