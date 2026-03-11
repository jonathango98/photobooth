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
    const url = cloudinary.utils.download_zip_url({
      prefixes: ["collage/", "raw/"],
      resource_type: "image",
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    };
  } catch (err) {
    console.error("Error generating zip URL:", err);
    return { statusCode: 500, body: "Error generating zip URL" };
  }
};
