import fs from "fs";
import path from "path";

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { online } = req.body || {};
  if (typeof online !== "boolean") {
    res.status(400).json({ error: "online must be boolean" });
    return;
  }

  const statePath = path.join(process.cwd(), "tmp", "network_state.json");
  const previous = readJsonSafe(statePath, { online: true });

  const nextState = {
    online,
    updatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(nextState, null, 2), "utf-8");

  res.status(200).json({ previous, current: nextState });
}

