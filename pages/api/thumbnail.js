import fs from "fs";
import path from "path";

/**
 * Serves thumbnail images from tmp/thumbnails so the UI can display them.
 * GET /api/thumbnail?name=visual-123-1.jpg
 * Only allows filenames (no path traversal).
 */
export default function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const name = req.query.name;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Missing or invalid name" });
    return;
  }

  // Only allow the base filename to prevent path traversal
  const basename = path.basename(name);
  if (basename !== name || basename.includes("..")) {
    res.status(400).json({ error: "Invalid name" });
    return;
  }

  const thumbPath = path.join(process.cwd(), "tmp", "thumbnails", basename);
  if (!fs.existsSync(thumbPath) || !fs.statSync(thumbPath).isFile()) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=60");
  fs.createReadStream(thumbPath).pipe(res);
}
