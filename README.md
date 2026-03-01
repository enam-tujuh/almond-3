## Sentinel-Local — Edge Safety Command Center (Prototype)

This repository contains a local-only prototype of **Sentinel-Local**, a command center web app that simulates an edge node running on a developer laptop in Singapore.

The system runs:

- **Level-1 audio trigger** (YAMNet-based, simulated) on uploaded or sample audio.
- **Level-2 visual verification** (YOLOv8n via Ultralytics) on a local webcam or sample video.
- **Rule-based fusion** into privacy-preserving JSON alerts rendered in the UI and optionally forwarded to a Telegram bot.

Everything runs on your own machine (no cloud), and is optimized for a laptop with an **RTX 4070** GPU.

---

### Install & run — Node / Next.js

From the project root:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` in your browser. You should see the **Sentinel-Local Command Center** with controls for triggering audio, verifying video, simulating network failures, and viewing fused alerts.

A **Sentinel Verification** tab runs in-browser at **http://localhost:3000/sentinel**: frame-by-frame human detection (TensorFlow.js COCO-SSD), square bounding boxes, looping scream audio, RMS-based danger trigger, and a red full-page alert when the audio threshold is exceeded. No backend required.

---

### Python backend setup

From the project root:

```bash
cd python_backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

pip install --upgrade pip

# Install PyTorch (CUDA 12.1 example for RTX 4070)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# Install remaining dependencies
pip install -r requirements.txt
```

The main scripts are:

- `audio_trigger.py` — runs YAMNet (or a simulated fallback) on an input WAV file and writes alerts to `tmp/audio_alerts.json`.
- `visual_verify.py` — runs YOLOv8n on a video file or webcam and writes detections to `tmp/visual_alerts.json` plus blurred thumbnails in `tmp/thumbnails/`.
- `fuse_alerts.py` — fuses audio + visual alerts into `tmp/alerts.json` and optionally appends to `tmp/offline_queue.csv` for store-and-forward when the network is simulated offline.

To test them manually:

```bash
cd python_backend
python audio_trigger.py --input ../public/sample_media/sample_scream.wav --out ../tmp/audio_alerts.json
python visual_verify.py --input ../public/sample_media/sample_lowres.mp4 --out ../tmp/visual_alerts.json --frames 150
python fuse_alerts.py --audio ../tmp/audio_alerts.json --visual ../tmp/visual_alerts.json --out ../tmp/alerts.json
```

> Note: You should place small demo files at `public/sample_media/sample_scream.wav` and `public/sample_media/sample_lowres.mp4` (for example, a short scream clip and a low‑resolution corridor video from a public dataset or Data.gov.sg–inspired scenario).

---

### Environment variables

Create `.env.local` in the project root to configure Telegram and Python:

```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
PYTHON_PATH=python  # or full path to your Python executable
```

If `PYTHON_PATH` is not set, the Node API routes will fall back to `python` on your `PATH`.

If Telegram variables are not provided, alerts remain local and are **not** sent anywhere.

---

### Data flow overview

1. **Level-1 (audio trigger)**  
   The UI calls `POST /api/trigger`, which spawns `audio_trigger.py` on the specified input audio file. Detected events such as `scream`, `glass_break`, or `gunshot` are written to `tmp/audio_alerts.json`.

2. **Level-2 (visual verification)**  
   When audio processing completes, the server automatically runs `visual_verify.py` on a short sample video (or webcam), producing privacy‑preserving thumbnails (faces/subjects blurred) and JSON detections in `tmp/visual_alerts.json`.

3. **Fusion & store‑and‑forward**  
   The server then calls `fuse_alerts.py`, which writes fused incident alerts to `tmp/alerts.json`.  
   If `POST /api/simulate_network` has set the network state to offline, fused alerts are also appended to `tmp/offline_queue.csv` for later forwarding.

4. **UI & optional Telegram**  
   The React UI polls `GET /api/alerts` to build a real‑time feed of fused alerts, including thumbnails, confidence scores, and sources (`["audio","visual"]`).  
   When Telegram is enabled and tokens are configured, the server can forward a compact text summary plus a blurred thumbnail, simulating a low‑bandwidth alert for a security team in Singapore.

---

### Training / fine‑tuning guidance (prototype)

- **Audio**: This prototype uses YAMNet via TensorFlow Hub as a pretrained model; no fine‑tuning is required for the demo.
- **Vision**: To fine‑tune YOLOv8n on a custom dataset (for example, Singapore corridors, MRT platforms, or HDB common areas), you can run:

```bash
# from python_backend/
# assume YOLOv8-style dataset config at data.yaml
yolo task=detect mode=train model=yolov8n.pt data=data.yaml epochs=20 imgsz=640 batch=16 device=0
```

On an RTX 4070, 20–30 epochs on a small curated dataset typically complete in well under an hour. For speed, you can also enable `fp16=true` and keep `imgsz=640`, `batch=16`.

---

### Limitations & next steps

- **Models**: YAMNet and YOLOv8n are used off‑the‑shelf; temporal action recognition and super‑resolution are purposely stubbed out for simplicity.
- **Mic / webcam**: The scripts focus on file‑based inputs for deterministic demos; live microphone support is not implemented in this prototype.
- **Uploads**: The main demo flow uses `public/sample_media` rather than arbitrary uploads to keep the stack simple and robust for judges.

Potential next steps:

- Integrate a lightweight temporal action recognition head to distinguish fights, falls, and loitering more robustly.
- Add a super‑resolution or low‑light enhancement module (e.g., LoRA‑style fine‑tuning on an efficient backbone) while keeping processing on‑device.
- Extend the Telegram integration to support multi‑chat routing (e.g., by site / region) and richer inline alert interactions.

