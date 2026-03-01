import { spawn } from "child_process";
import path from "path";
import fs from "fs";

function getPythonPath() {
  return process.env.PYTHON_PATH || "python";
}

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

  const { input } = req.body || {};
  const videoInput =
    input || path.join("public", "sample_media", "sample_lowres.mp4");

  const pythonPath = getPythonPath();
  const visualScript = path.join(
    process.cwd(),
    "python_backend",
    "visual_verify.py",
  );
  const visualOut = path.join("tmp", "visual_alerts.json");

  const visualProc = spawn(
    pythonPath,
    [visualScript, "--input", videoInput, "--out", visualOut, "--frames", "150"],
    {
      cwd: process.cwd(),
      shell: process.platform === "win32",
    },
  );

  visualProc.stdout.on("data", (d) => {
    console.log(`[visual_verify] ${d.toString()}`);
  });
  visualProc.stderr.on("data", (d) => {
    console.error(`[visual_verify][err] ${d.toString()}`);
  });

  visualProc.on("close", () => {
    const networkStatePath = path.join("tmp", "network_state.json");
    const networkState = readJsonSafe(networkStatePath, { online: true });
    const fuseScript = path.join(
      process.cwd(),
      "python_backend",
      "fuse_alerts.py",
    );
    const fusedOut = path.join("tmp", "alerts.json");

    const fuseArgs = [
      fuseScript,
      "--audio",
      path.join("tmp", "audio_alerts.json"),
      "--visual",
      visualOut,
      "--out",
      fusedOut,
    ];

    if (!networkState.online) {
      fuseArgs.push("--store");
    }

    const fuseProc = spawn(getPythonPath(), fuseArgs, {
      cwd: process.cwd(),
      shell: process.platform === "win32",
    });

    fuseProc.stdout.on("data", (d) => {
      console.log(`[fuse_alerts] ${d.toString()}`);
    });
    fuseProc.stderr.on("data", (d) => {
      console.error(`[fuse_alerts][err] ${d.toString()}`);
    });
  });

  res.status(202).json({
    status: "accepted",
    message: "Visual verification started on server.",
  });
}

