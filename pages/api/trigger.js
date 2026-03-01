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
  const audioInput =
    input || path.join("public", "sample_media", "sample_scream.wav");

  const pythonPath = getPythonPath();
  const scriptPath = path.join(
    process.cwd(),
    "python_backend",
    "audio_trigger.py",
  );

  const outPath = path.join("tmp", "audio_alerts.json");

  // Fire-and-forget job; frontend will poll /api/alerts for fused alerts.
  const child = spawn(
    pythonPath,
    [scriptPath, "--input", audioInput, "--out", outPath, "--threshold", "0.5"],
    {
      cwd: process.cwd(),
      shell: process.platform === "win32",
    },
  );

  child.stdout.on("data", (data) => {
    console.log(`[audio_trigger] ${data.toString()}`);
  });

  child.stderr.on("data", (data) => {
    console.error(`[audio_trigger][err] ${data.toString()}`);
  });

  child.on("close", () => {
    // After audio trigger completes, kick off visual verification + fusion.
    const verifyUrl = path.join("public", "sample_media", "sample_lowres.mp4");
    const visualScript = path.join(
      process.cwd(),
      "python_backend",
      "visual_verify.py",
    );
    const visualOut = path.join("tmp", "visual_alerts.json");

    const visualProc = spawn(
      pythonPath,
      [visualScript, "--input", verifyUrl, "--out", visualOut, "--frames", "150"],
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
        outPath,
        "--visual",
        visualOut,
        "--out",
        fusedOut,
      ];

      if (!networkState.online) {
        fuseArgs.push("--store");
      }

      const fuseProc = spawn(pythonPath, fuseArgs, {
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
  });

  res
    .status(202)
    .json({ status: "accepted", message: "Audio trigger started on server." });
}

