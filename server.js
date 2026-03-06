// server.js (ES Module)
import express from "express";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";
import "dotenv/config";

// --------------------------
// Cloudinary configuration
// --------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

// --------------------------
// Multer setup (in-memory)
// --------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
  },
});

// Helper for uploading buffer to Cloudinary
function uploadFromBuffer(buffer, folder, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: filename.replace(/\.[^/.]+$/, ""), // Remove extension
        resource_type: "auto",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// --------------------------
// /api/save endpoint
// --------------------------
const cpUpload = upload.fields([
  { name: "raw1", maxCount: 1 },
  { name: "raw2", maxCount: 1 },
  { name: "raw3", maxCount: 1 },
  { name: "collage", maxCount: 1 },
]);

app.post("/api/save", cpUpload, async (req, res) => {
  try {
    const files = req.files || {};
    console.log("Received files:", Object.keys(files));

    // Simple session id for grouping
    const sessionId = Date.now().toString();

    // 1) Save raw photos to Cloudinary
    const rawFields = ["raw1", "raw2", "raw3"];
    const uploadPromises = [];

    rawFields.forEach((fieldName, index) => {
      const fileArr = files[fieldName];
      if (!fileArr || fileArr.length === 0) return;

      const file = fileArr[0];
      const rawFilename = `session_${sessionId}_raw${index + 1}`;
      uploadPromises.push(uploadFromBuffer(file.buffer, "raw", rawFilename));
    });

    // 2) Save collage to Cloudinary
    const collageArr = files["collage"];
    if (!collageArr || collageArr.length === 0) {
      console.error("No collage file received");
      return res.status(400).send("No collage file received");
    }

    const collageFile = collageArr[0];
    const collageFilename = `session_${sessionId}_collage`;
    const collageUploadPromise = uploadFromBuffer(collageFile.buffer, "collage", collageFilename);

    // Wait for all uploads to complete
    const [collageResult] = await Promise.all([
      collageUploadPromise,
      ...uploadPromises,
    ]);

    console.log("Uploaded collage:", collageResult.secure_url);

    // 3) Build web URL for collage (for QR code)
    const collageUrl = collageResult.secure_url;

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
