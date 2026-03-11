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

app.use(express.json());
// Serve frontend files (index.html, main.js, etc.)
app.use(express.static(path.join(__dirname, "public")));

// --------------------------
// Admin Middleware
// --------------------------
const checkAdmin = (req, res, next) => {
  const password = req.headers["x-admin-password"];
  if (password === process.env.ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).send("Unauthorized");
  }
};

// --------------------------
// Admin API endpoints
// --------------------------
app.get("/api/admin/photos", checkAdmin, async (req, res) => {
  try {
    // List both 'collage' and 'raw' folders
    const [collageRes, rawRes] = await Promise.all([
      cloudinary.api.resources({ type: 'upload', prefix: 'collage/', max_results: 500 }),
      cloudinary.api.resources({ type: 'upload', prefix: 'raw/', max_results: 500 })
    ]);

    res.json({
      collages: collageRes.resources,
      raws: rawRes.resources
    });
  } catch (err) {
    console.error("Error listing photos:", err);
    res.status(500).send("Error listing photos");
  }
});

app.post("/api/admin/download-selected", checkAdmin, (req, res) => {
  try {
    const { publicIds } = req.body;
    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return res.status(400).send("No photos selected");
    }

    // Generate a zip URL for the specific public IDs provided
    const url = cloudinary.utils.download_zip_url({
      public_ids: publicIds,
      resource_type: "image",
    });
    res.json({ url });
  } catch (err) {
    console.error("Error generating selected zip URL:", err);
    res.status(500).send("Error generating zip URL");
  }
});

app.get("/api/admin/download-zip", checkAdmin, (req, res) => {
  try {
    // Generate a zip URL for all uploaded files
    const url = cloudinary.utils.download_zip_url({
      prefixes: ["collage/", "raw/"],
      resource_type: "image",
    });
    res.json({ url });
  } catch (err) {
    console.error("Error generating zip URL:", err);
    res.status(500).send("Error generating zip URL");
  }
});

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
const MAX_RAW_PHOTOS = 10;
const rawFields = Array.from({ length: MAX_RAW_PHOTOS }, (_, i) => ({
  name: `raw${i + 1}`,
  maxCount: 1,
}));

const cpUpload = upload.fields([
  ...rawFields,
  { name: "collage", maxCount: 1 },
]);

app.post("/api/save", cpUpload, async (req, res) => {
  try {
    const files = req.files || {};

    const sessionId = Date.now().toString();

    // 1) Save raw photos to Cloudinary
    const uploadPromises = [];

    for (let i = 0; i < MAX_RAW_PHOTOS; i++) {
      const fieldName = `raw${i + 1}`;
      const fileArr = files[fieldName];
      if (!fileArr || fileArr.length === 0) continue;

      const file = fileArr[0];
      const rawFilename = `session_${sessionId}_raw${i + 1}`;
      uploadPromises.push(uploadFromBuffer(file.buffer, "raw", rawFilename));
    }

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
