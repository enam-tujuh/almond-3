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
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const alertsPath = path.join(process.cwd(), "tmp", "alerts.json");
  const alerts = readJsonSafe(alertsPath, []);
  res.status(200).json(alerts);
}

