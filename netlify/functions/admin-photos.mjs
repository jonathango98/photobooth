import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const handler = async (event) => {
  if (event.headers["x-admin-password"] !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  try {
    const [collageRes, rawRes] = await Promise.all([
      cloudinary.api.resources({ type: "upload", prefix: "collage/", max_results: 500 }),
      cloudinary.api.resources({ type: "upload", prefix: "raw/", max_results: 500 }),
    ]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collages: collageRes.resources,
        raws: rawRes.resources,
      }),
    };
  } catch (err) {
    console.error("Error listing photos:", err);
    return { statusCode: 500, body: "Error listing photos" };
  }
};
