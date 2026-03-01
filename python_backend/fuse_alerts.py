import argparse
import csv
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List


def load_json(path: str) -> List[Dict[str, Any]]:
  if not os.path.exists(path):
    return []
  try:
    with open(path, "r", encoding="utf-8") as f:
      data = json.load(f)
    if isinstance(data, list):
      return data
    return []
  except Exception as e:  # pragma: no cover
    print(f"[fuse_alerts] Failed to read {path}: {e}", file=sys.stderr)
    return []


def fuse_alerts(
  audio_alerts: List[Dict[str, Any]], visual_alerts: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
  fused: List[Dict[str, Any]] = []

  # Very simple fusion: pair any audio + visual alerts into a single fused incident.
  if not audio_alerts and not visual_alerts:
    return fused

  if not audio_alerts:
    # Visual-only incident
    for v in visual_alerts:
      fused.append(
        {
          "id": str(uuid.uuid4()),
          "time_iso": v.get("timestamp_iso") or datetime.now(timezone.utc).isoformat(),
          "location": "Singapore — Block 12 (simulated)",
          "incident_type": "unknown",
          "confidence": float(v.get("conf", 0.7)),
          "sources": ["visual"],
          "thumbnail": v.get("thumbnail_path", ""),
          "metadata": {"audio": [], "visual": [v]},
        }
      )
    return fused

  if not visual_alerts:
    # Audio-only incident
    for a in audio_alerts:
      fused.append(
        {
          "id": str(uuid.uuid4()),
          "time_iso": a.get("timestamp_iso") or datetime.now(timezone.utc).isoformat(),
          "location": "Singapore — Block 12 (simulated)",
          "incident_type": a.get("label", "unknown"),
          "confidence": float(a.get("score", 0.7)),
          "sources": ["audio"],
          "thumbnail": "",
          "metadata": {"audio": [a], "visual": []},
        }
      )
    return fused

  # Audio + visual present: create a fused alert for the first pair.
  a0 = audio_alerts[0]
  v0 = visual_alerts[0]
  incident_type = a0.get("label", "unknown")
  confidence = float(a0.get("score", 0.7) * 0.5 + v0.get("conf", 0.7) * 0.5)

  fused.append(
    {
      "id": str(uuid.uuid4()),
      "time_iso": datetime.now(timezone.utc).isoformat(),
      "location": "Singapore — Block 12 (simulated)",
      "incident_type": incident_type,
      "confidence": confidence,
      "sources": ["audio", "visual"],
      "thumbnail": v0.get("thumbnail_path", ""),
      "metadata": {"audio": audio_alerts, "visual": visual_alerts},
    }
  )

  return fused


def append_offline_queue(alerts: List[Dict[str, Any]], queue_path: str) -> None:
  if not alerts:
    return
  os.makedirs(os.path.dirname(queue_path), exist_ok=True)
  fieldnames = [
    "id",
    "time_iso",
    "location",
    "incident_type",
    "confidence",
    "thumbnail",
  ]
  file_exists = os.path.exists(queue_path)
  with open(queue_path, "a", newline="", encoding="utf-8") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
    if not file_exists:
      writer.writeheader()
    for alert in alerts:
      writer.writerow(
        {
          "id": alert.get("id"),
          "time_iso": alert.get("time_iso"),
          "location": alert.get("location"),
          "incident_type": alert.get("incident_type"),
          "confidence": alert.get("confidence"),
          "thumbnail": alert.get("thumbnail"),
        }
      )


def main() -> None:
  parser = argparse.ArgumentParser(description="Fuse audio and visual alerts into a single incident stream.")
  parser.add_argument("--audio", default="tmp/audio_alerts.json", help="Path to audio alerts JSON.")
  parser.add_argument("--visual", default="tmp/visual_alerts.json", help="Path to visual alerts JSON.")
  parser.add_argument("--out", default="tmp/alerts.json", help="Output fused alerts JSON.")
  parser.add_argument(
    "--store",
    action="store_true",
    help="If set, also append fused alerts to offline store-and-forward queue (CSV).",
  )
  args = parser.parse_args()

  audio_alerts = load_json(args.audio)
  visual_alerts = load_json(args.visual)
  fused = fuse_alerts(audio_alerts, visual_alerts)

  os.makedirs(os.path.dirname(args.out), exist_ok=True)
  with open(args.out, "w", encoding="utf-8") as f:
    json.dump(fused, f, indent=2)

  if args.store:
    append_offline_queue(fused, "tmp/offline_queue.csv")

  print(json.dumps(fused, indent=2))


if __name__ == "__main__":
  main()

