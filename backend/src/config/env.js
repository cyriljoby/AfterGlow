const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "WORLD_RP_ID",
  "WORLD_RP_SIGNING_KEY",
  "WORLD_ACTION",
  "JWT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_UPLOAD_PRESET",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3001,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  worldRpId: process.env.WORLD_RP_ID,
  worldRpSigningKey: process.env.WORLD_RP_SIGNING_KEY,
  worldAction: process.env.WORLD_ACTION,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
  cloudinaryUploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
  cloudinaryWebhookSecret: process.env.CLOUDINARY_WEBHOOK_SECRET || "",
};
