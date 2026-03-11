import Busboy from "busboy";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadFromBuffer(buffer, folder, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: filename, resource_type: "auto" },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });
}

function parseMultipart(contentType, bodyBuffer) {
  return new Promise((resolve, reject) => {
    const files = {};
    const bb = Busboy({ headers: { "content-type": contentType } });

    bb.on("file", (fieldname, stream) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        files[fieldname] = { buffer: Buffer.concat(chunks) };
      });
    });

    bb.on("finish", () => resolve(files));
    bb.on("error", reject);

    bb.write(bodyBuffer);
    bb.end();
  });
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const contentType = event.headers["content-type"];
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body ?? "", "utf-8");

    const files = await parseMultipart(contentType, body);

    const collage = files["collage"];
    if (!collage) {
      return { statusCode: 400, body: "No collage file received" };
    }

    const sessionId = Date.now().toString();
    const uploadPromises = [];

    for (let i = 1; i <= 10; i++) {
      const field = files[`raw${i}`];
      if (!field) continue;
      uploadPromises.push(
        uploadFromBuffer(field.buffer, "raw", `session_${sessionId}_raw${i}`)
      );
    }

    const [collageResult] = await Promise.all([
      uploadFromBuffer(collage.buffer, "collage", `session_${sessionId}_collage`),
      ...uploadPromises,
    ]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        sessionId,
        collageUrl: collageResult.secure_url,
      }),
    };
  } catch (err) {
    console.error("Error in save function:", err);
    return { statusCode: 500, body: "Server error while saving files" };
  }
};
