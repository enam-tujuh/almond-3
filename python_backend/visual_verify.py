import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import List, Dict, Any

import cv2  # type: ignore
import numpy as np
from ultralytics import YOLO  # type: ignore


def load_model() -> YOLO:
  """
  Load YOLOv8n model. Falls back to CPU if GPU is not available.
  """
  try:
    model = YOLO("yolov8n.pt")
    return model
  except Exception as e:  # pragma: no cover - fallback
    print(f"[visual_verify] Error loading YOLOv8n model: {e}", file=sys.stderr)
    raise


def ensure_dir(path: str) -> None:
  os.makedirs(path, exist_ok=True)


def blur_bbox(frame: np.ndarray, bbox: List[float]) -> np.ndarray:
  x1, y1, x2, y2 = [int(v) for v in bbox]
  h, w = frame.shape[:2]
  x1 = max(0, min(x1, w - 1))
  x2 = max(0, min(x2, w))
  y1 = max(0, min(y1, h - 1))
  y2 = max(0, min(y2, h))

  roi = frame[y1:y2, x1:x2]
  if roi.size == 0:
    return frame
  blurred = cv2.GaussianBlur(roi, (31, 31), 0)
  frame[y1:y2, x1:x2] = blurred
  return frame


def run_visual_verification(
  input_source: str, out_path: str, max_frames: int, conf_threshold: float = 0.5
) -> None:
  cap = cv2.VideoCapture(0 if input_source == "webcam" else input_source)
  if not cap.isOpened():
    print(f"[visual_verify] Failed to open video source {input_source}", file=sys.stderr)
    detections: List[Dict[str, Any]] = []
  else:
    model = load_model()
    detections = []
    frame_count = 0
    thumbnails_dir = os.path.join("tmp", "thumbnails")
    ensure_dir(thumbnails_dir)

    while frame_count < max_frames:
      ret, frame = cap.read()
      if not ret:
        break

      frame_count += 1
      # Use YOLO; results is a list, take first item.
      results = model.predict(source=frame, verbose=False)
      if not results:
        continue
      res = results[0]
      if res.boxes is None:
        continue

      for box in res.boxes:
        cls_id = int(box.cls.item())
        conf = float(box.conf.item())
        if conf < conf_threshold:
          continue

        label = model.names.get(cls_id, f"class_{cls_id}")
        # Focus on safety-relevant classes: person, knife/weapon-like if present
        lower_label = label.lower()
        if "person" not in lower_label and "knife" not in lower_label and "gun" not in lower_label:
          continue

        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
        bbox = [x1, y1, x2, y2]

        frame_copy = frame.copy()
        frame_copy = blur_bbox(frame_copy, bbox)

        det_id = f"visual-{int(datetime.now().timestamp())}-{frame_count}"
        thumbnail_rel = os.path.join("tmp", "thumbnails", f"{det_id}.jpg")
        thumbnail_abs = os.path.join(os.getcwd(), thumbnail_rel.replace("/", os.sep))
        ensure_dir(os.path.dirname(thumbnail_abs))
        cv2.imwrite(thumbnail_abs, frame_copy)

        detections.append(
          {
            "id": det_id,
            "timestamp_iso": datetime.now(timezone.utc).isoformat(),
            "class": label,
            "conf": conf,
            "bbox": bbox,
            "thumbnail_path": thumbnail_rel.replace("\\", "/"),
          }
        )

    cap.release()

  os.makedirs(os.path.dirname(out_path), exist_ok=True)
  with open(out_path, "w", encoding="utf-8") as f:
    json.dump(detections, f, indent=2)

  print(json.dumps(detections, indent=2))


def main() -> None:
  parser = argparse.ArgumentParser(description="Level-2 visual verification using YOLOv8n.")
  parser.add_argument("--input", required=True, help='Path to video file or "webcam".')
  parser.add_argument("--out", default="tmp/visual_alerts.json", help="Output JSON path.")
  parser.add_argument("--frames", type=int, default=150, help="Maximum number of frames to process.")
  args = parser.parse_args()

  run_visual_verification(args.input, args.out, args.frames)


if __name__ == "__main__":
  main()

