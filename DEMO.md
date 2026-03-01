## Sentinel-Local Demo Script (2–3 minutes)

This script walks you through a short, judge‑friendly demo of the Sentinel-Local prototype running entirely on your laptop in Singapore.

---

### 1. Start services

In terminal 1 (project root):

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser — you should see the **Sentinel-Local Command Center**.

In terminal 2:

```bash
cd python_backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

Make sure you have two small media files:

- `public/sample_media/sample_scream.wav` — short scream / alarm sound.
- `public/sample_media/sample_lowres.mp4` — short low‑resolution corridor or hallway clip.

---

### 2. End‑to‑end alert pipeline (happy path)

1. In the browser, briefly introduce the UI:
   - **Left**: real‑time fused alert feed.
   - **Right**: controls, network simulation, resource snapshot, and bandwidth savings widget.
   - Emphasize: *“This simulates an edge node deployed in Singapore, processing data locally and only emitting low‑bandwidth alerts.”*

2. Click **“Simulate Audio Trigger”**.
   - Explain: *“We’re running a Level‑1 YAMNet trigger on a local scream clip. This would be listening to a live microphone in a real deployment.”*
   - Mention that the Next.js API is spawning `audio_trigger.py` and writing to `tmp/audio_alerts.json`, then chaining `visual_verify.py` and `fuse_alerts.py`.

3. Within ~5–15 seconds, point to the new alert in the feed:
   - Show the **blurred thumbnail**, **incident type** (e.g. `scream`), **confidence**, and **sources** (`audio`, `visual`).
   - Highlight: *“Notice that we never stream video to the browser or to the cloud — only a small JSON alert and a blurred image leave the Python process.”*

4. Mark the alert as **“Confirmed”** in the UI to demonstrate explainability and operator feedback.

Optional: in a third terminal, run:

```bash
nvidia-smi
```

while the visual verification is running to show GPU usage on the RTX 4070.

---

### 3. Store‑and‑forward network simulation

1. In the **Network & Notifications** card, click **“Simulate Network Failure”**.
   - Explain: *“We are now simulating a loss of uplink — the edge node is offline. We still want to capture incidents locally and forward them later.”*

2. Click **“Simulate Audio Trigger”** again.
   - The pipeline runs as before, but `fuse_alerts.py` appends the fused alert to `tmp/offline_queue.csv` instead of sending it live.

3. Toggle **“Restore Network”**.
   - Explain: *“When connectivity returns, the queued alerts can be forwarded upstream or to a Telegram bot, implementing store‑and‑forward.”*

You can open `tmp/offline_queue.csv` in a text editor to show the queued alerts.

---

### 4. Optional Telegram integration

If you configured a bot:

1. Set env vars in `.env.local`:

```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
PYTHON_PATH=python
```

2. Restart `npm run dev`.

3. In the UI, enable the **“Send alerts to Telegram”** toggle (conceptual).  
   When fused alerts are available, the server can forward a compact message such as:

> “Sentinel-Local alert (Singapore — Block 12): scream detected with 0.92 confidence. See blurred thumbnail.”

This demonstrates a **low‑bandwidth, privacy‑preserving** notification path suitable for operations teams on Telegram instead of streaming CCTV.

---

### 5. Closing talking points (30–60 seconds)

- **Privacy by default**: Only blurred thumbnails and structured JSON leave the edge node; raw audio/video stay local and transient in `tmp/`.
- **Low bandwidth**: 1080p video at ~5 MB/s vs ~1 KB alerts → **thousands of times less bandwidth**.
- **Explainability**: Each alert includes sources, timestamps, confidence, and can be marked “confirmed” or “false positive” by an operator.
- **Extendable**: The same pattern can add super‑resolution, temporal action recognition, or LoRA‑style custom models while keeping processing on-device in Singapore deployments.

