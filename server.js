// server.js (ES Module)
import express from "express";
import cors from "cors";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import archiver from "archiver";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------
// S3 client (Railway Bucket)
// --------------------------
const s3 = new S3Client({
  region: process.env.AWS_REGION || "auto",
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.BUCKET_NAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PRESIGN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

// --------------------------
// App setup
// --------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --------------------------
// Multer (in-memory)
// --------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// --------------------------
// Admin auth middleware
// --------------------------
function requireAdmin(req, res, next) {
  const password = req.headers["x-admin-password"];
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// --------------------------
// Health check
// --------------------------
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// --------------------------
// POST /api/save
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

    const sessionId = Date.now().toString();

    // Upload raw photos
    const rawFields = ["raw1", "raw2", "raw3"];
    const rawUploads = rawFields.map((fieldName, index) => {
      const fileArr = files[fieldName];
      if (!fileArr || fileArr.length === 0) return Promise.resolve();
      const key = `raw/session_${sessionId}_raw${index + 1}.jpg`;
      return s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: fileArr[0].buffer,
          ContentType: "image/jpeg",
        })
      );
    });

    // Upload collage
    const collageArr = files["collage"];
    if (!collageArr || collageArr.length === 0) {
      return res.status(400).json({ error: "No collage file received" });
    }

    const collageKey = `collage/session_${sessionId}_collage.jpg`;
    const collageUpload = s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: collageKey,
        Body: collageArr[0].buffer,
        ContentType: "image/jpeg",
      })
    );

    await Promise.all([collageUpload, ...rawUploads]);
    console.log("Uploaded session:", sessionId);

    // Presigned URL for collage (7-day expiry) for QR code
    const collageUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: collageKey }),
      { expiresIn: PRESIGN_EXPIRY }
    );

    res.json({ ok: true, sessionId, collageUrl });
  } catch (err) {
    console.error("Error in /api/save:", err);
    res.status(500).json({ error: "Server error while saving files" });
  }
});

// --------------------------
// GET /api/admin/photos
// --------------------------
app.get("/api/admin/photos", requireAdmin, async (req, res) => {
  try {
    const folders = ["collage", "raw"];
    const photos = [];

    for (const folder of folders) {
      const result = await s3.send(
        new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `${folder}/` })
      );

      for (const obj of result.Contents || []) {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
          { expiresIn: PRESIGN_EXPIRY }
        );
        photos.push({
          id: obj.Key,
          url,
          folder,
          uploadedAt: obj.LastModified,
        });
      }
    }

    res.json({ ok: true, photos, total: photos.length });
  } catch (err) {
    console.error("Error in /api/admin/photos:", err);
    res.status(500).json({ error: "Failed to fetch photos" });
  }
});

// --------------------------
// POST /api/admin/download-selected
// --------------------------
app.post("/api/admin/download-selected", requireAdmin, async (req, res) => {
  try {
    const { photoIds } = req.body;
    if (!photoIds || photoIds.length === 0) {
      return res.status(400).json({ error: "No photos selected" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=selected-photos.zip"
    );

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);

    for (const key of photoIds) {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: key })
      );
      const filename = key.split("/").pop();
      archive.append(obj.Body, { name: filename });
    }

    await archive.finalize();
  } catch (err) {
    console.error("Error in /api/admin/download-selected:", err);
    res.status(500).json({ error: "Failed to download selected photos" });
  }
});

// --------------------------
// GET /api/admin/download-zip
// --------------------------
app.get("/api/admin/download-zip", requireAdmin, async (_req, res) => {
  try {
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=all-photos.zip"
    );

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);

    for (const folder of ["collage", "raw"]) {
      const result = await s3.send(
        new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `${folder}/` })
      );

      for (const obj of result.Contents || []) {
        const file = await s3.send(
          new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key })
        );
        const filename = obj.Key.split("/").pop();
        archive.append(file.Body, { name: `${folder}/${filename}` });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("Error in /api/admin/download-zip:", err);
    res.status(500).json({ error: "Failed to download photos" });
  }
});

// --------------------------
// Start server
// --------------------------
app.listen(PORT, () => {
  console.log(`Photobooth server listening on http://localhost:${PORT}`);
});
