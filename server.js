// server.js (ES Module)
import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";

// --------------------------
// __dirname replacement in ESM
// --------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------
// Basic setup
// --------------------------
const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend files (index.html, main.js, etc.)
app.use(express.static(path.join(__dirname, "public")));

// Serve saved photos so QR code links work
app.use("/photos", express.static(path.join(__dirname, "photos")));

// --------------------------
// Multer setup (in-memory)
// --------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
  },
});

// Ensure folders exist
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const RAW_DIR = path.join(__dirname, "photos", "raw");
const COLLAGE_DIR = path.join(__dirname, "photos", "collage");
ensureDir(RAW_DIR);
ensureDir(COLLAGE_DIR);

// --------------------------
// /api/save endpoint
// --------------------------
const cpUpload = upload.fields([
  { name: "raw1", maxCount: 1 },
  { name: "raw2", maxCount: 1 },
  { name: "raw3", maxCount: 1 },
  { name: "collage", maxCount: 1 },
]);

app.post("/api/save", cpUpload, (req, res) => {
  try {
    const files = req.files || {};
    console.log("Received files:", Object.keys(files));

    // Simple session id for grouping
    const sessionId = Date.now().toString();

    // 1) Save raw photos
    const rawFields = ["raw1", "raw2", "raw3"];

    rawFields.forEach((fieldName, index) => {
      const fileArr = files[fieldName];
      if (!fileArr || fileArr.length === 0) return;

      const file = fileArr[0];
      const rawFilename = `session_${sessionId}_raw${index + 1}.jpg`;
      const rawPath = path.join(RAW_DIR, rawFilename);

      fs.writeFileSync(rawPath, file.buffer);
      console.log("Saved raw:", rawPath);
    });

    // 2) Save collage
    const collageArr = files["collage"];
    if (!collageArr || collageArr.length === 0) {
      console.error("No collage file received");
      return res.status(400).send("No collage file received");
    }

    const collageFile = collageArr[0];
    const collageFilename = `session_${sessionId}_collage.jpg`;
    const collagePath = path.join(COLLAGE_DIR, collageFilename);

    fs.writeFileSync(collagePath, collageFile.buffer);
    console.log("Saved collage:", collagePath);

    // 3) Build web URL for collage (for QR code)
    const collageUrl = `/photos/collage/${collageFilename}`;

    // 4) Respond JSON (frontend expects .json() with collageUrl)
    res.json({
      ok: true,
      sessionId,
      collageUrl,
    });
  } catch (err) {
    console.error("Error in /api/save:", err);
    res.status(500).send("Server error while saving files");
  }
});

// --------------------------
// Start server
// --------------------------
app.listen(PORT, () => {
  console.log(`Photobooth server listening on http://localhost:${PORT}`);
});
