// Backend configuration. `.env` is loaded once here (Node's built-in loader) before anything reads process.env.
import fs from "node:fs";
import path from "node:path";

const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
  // Existing variables win, so CLI overrides (e.g. DATABASE_URL=… npm run dev) still apply.
  process.loadEnvFile(envFile);
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  isProd: process.env.NODE_ENV === "production",
  port: num(process.env.PORT, 5000),
  /** Frontend origins allowed to call the API with credentials (comma-separated). */
  corsOrigins: (process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean),
  sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 168),
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads"),
  uploadMaxBytes: num(process.env.UPLOAD_MAX_BYTES, 5 * 1024 * 1024),
  dueSoonDays: num(process.env.REMINDER_DUE_SOON_DAYS, 30),
  reminderIntervalMinutes: num(process.env.REMINDER_INTERVAL_MINUTES, 60),
  /** Secret used to hash IPs in the audit log so raw addresses are never stored. */
  get auditSalt(): string {
    return process.env.JWT_SECRET ?? "rtn-dev-audit-salt";
  },
};
