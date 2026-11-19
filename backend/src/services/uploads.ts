// Local file storage under ./uploads (replaces Cloudinary). Every image is
// verified by magic bytes, then re-encoded with sharp — which strips EXIF/GPS
// metadata (Section U location privacy) and neutralises polyglot payloads.
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// libvips keeps opened files cached; on Windows that blocks deleting/replacing uploads it has read.
sharp.cache({ files: 0 });
import { ApiError, badRequest } from "../utils/http";
import { env } from "../config/env";
import type { UploadKind } from "../validators";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DIMENSION = 1600;

function sniff(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export type StoredUpload = { url: string; bytes: number; width: number; height: number; buffer: Buffer };

/** Shape of a multer memory-storage file (also easy to build in tests). */
export type IncomingImage = { buffer: Buffer; mimetype: string; size: number };

export async function saveImageUpload(file: IncomingImage, kind: UploadKind): Promise<StoredUpload> {
  if (!ALLOWED_MIME.has(file.mimetype)) throw badRequest("Only JPEG, PNG or WebP images are allowed");
  if (file.size > env.uploadMaxBytes) {
    throw new ApiError(413, `Image must be ${(env.uploadMaxBytes / 1024 / 1024).toFixed(0)} MB or smaller`, "FILE_TOO_LARGE");
  }
  const raw = file.buffer;
  if (!sniff(raw)) throw badRequest("File content is not a valid JPEG, PNG or WebP image");

  const out = await sharp(raw, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw badRequest("Image could not be processed");
    });

  const name = `${Date.now().toString(36)}-${randomBytes(9).toString("base64url")}.webp`;
  const dir = path.join(env.uploadDir, kind);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), out.data);
  return { url: `/uploads/${kind}/${name}`, bytes: out.info.size, width: out.info.width, height: out.info.height, buffer: out.data };
}

/** Maps a public /uploads/... url to an absolute path, refusing traversal outside the upload root. */
export function resolveUploadPath(urlOrRelative: string): string | null {
  const rel = urlOrRelative.replace(/^\/?uploads\//, "");
  if (!rel || rel.includes("\0")) return null;
  const abs = path.resolve(env.uploadDir, rel);
  const root = env.uploadDir.endsWith(path.sep) ? env.uploadDir : env.uploadDir + path.sep;
  return abs.startsWith(root) ? abs : null;
}

export async function readUpload(url: string): Promise<Buffer | null> {
  const abs = resolveUploadPath(url);
  if (!abs) return null;
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

export async function deleteUpload(url: string | null | undefined) {
  if (!url || url.startsWith("/uploads/seed/")) return;
  const abs = resolveUploadPath(url);
  if (abs) await fs.rm(abs, { force: true });
}

export const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};
