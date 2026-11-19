// Local upload storage: MIME + magic-byte validation, unique names, metadata stripping, traversal guard.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rtn-uploads-"));
let uploads: typeof import("@/services/uploads");

beforeAll(async () => {
  process.env.UPLOAD_DIR = dir;
  process.env.UPLOAD_MAX_BYTES = String(2 * 1024 * 1024);
  vi.resetModules(); // env.ts reads UPLOAD_DIR at import time
  uploads = await import("@/services/uploads");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  delete process.env.UPLOAD_DIR;
  delete process.env.UPLOAD_MAX_BYTES;
});

/** Same shape multer hands the upload service. */
const img = (buffer: Buffer, mimetype: string) => ({ buffer, mimetype, size: buffer.length });

async function pngWithExif() {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 150, b: 60 } } })
    .withExif({ IFD0: { Copyright: "secret-owner", ImageDescription: "GPS 27.7,85.3" } })
    .png()
    .toBuffer();
}

describe("saveImageUpload", () => {
  it("re-encodes to WebP under a unique name inside the upload kind folder", async () => {
    const buf = await pngWithExif();
    const a = await uploads.saveImageUpload(img(buf, "image/png"), "pets");
    const b = await uploads.saveImageUpload(img(buf, "image/png"), "pets");
    expect(a.url).toMatch(/^\/uploads\/pets\/[A-Za-z0-9_-]+\.webp$/);
    expect(a.url).not.toBe(b.url);
    const onDisk = path.join(dir, "pets", path.basename(a.url));
    expect(fs.existsSync(onDisk)).toBe(true);
    expect((await sharp(onDisk).metadata()).format).toBe("webp");
  });

  it("strips EXIF metadata (location privacy)", async () => {
    const buf = await pngWithExif();
    expect((await sharp(buf).metadata()).exif).toBeDefined();
    const saved = await uploads.saveImageUpload(img(buf, "image/png"), "incidents");
    expect((await sharp(path.join(dir, "incidents", path.basename(saved.url))).metadata()).exif).toBeUndefined();
  });

  it("rejects disallowed MIME types", async () => {
    await expect(uploads.saveImageUpload(img(Buffer.from("GIF89a"), "image/gif"), "pets")).rejects.toMatchObject({ status: 400 });
  });

  it("rejects files whose bytes are not really an image (spoofed MIME)", async () => {
    const fake = img(Buffer.from("<?php system($_GET['c']); ?>"), "image/png");
    await expect(uploads.saveImageUpload(fake, "pets")).rejects.toMatchObject({ status: 400 });
  });

  it("rejects files over the size limit with 413", async () => {
    const big = img(Buffer.alloc(2 * 1024 * 1024 + 1), "image/png");
    await expect(uploads.saveImageUpload(big, "pets")).rejects.toMatchObject({ status: 413 });
  });
});

describe("resolveUploadPath", () => {
  it("maps public URLs inside the upload root", () => {
    expect(uploads.resolveUploadPath("/uploads/pets/a.webp")).toBe(path.join(dir, "pets", "a.webp"));
  });
  it.each(["/uploads/../package.json", "../../etc/passwd", "/uploads/pets/../../../secret", "/uploads/\0x"])("refuses traversal: %s", (p) => {
    expect(uploads.resolveUploadPath(p)).toBeNull();
  });
});
