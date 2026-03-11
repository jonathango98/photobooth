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

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { publicIds } = JSON.parse(event.body);
    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return { statusCode: 400, body: "No photos selected" };
    }

    const url = cloudinary.utils.download_zip_url({
      public_ids: publicIds,
      resource_type: "image",
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    };
  } catch (err) {
    console.error("Error generating selected zip URL:", err);
    return { statusCode: 500, body: "Error generating zip URL" };
  }
};
