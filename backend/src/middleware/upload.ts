// Multipart parsing for image uploads (kept in memory; services/uploads.ts validates and stores).
import multer from "multer";
import { env } from "../config/env";

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.uploadMaxBytes, files: 1, fields: 10 },
});
