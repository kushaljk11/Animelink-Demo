// Integration harness: isolated *_test database + the real Express app mounted in-process.
//
//   1. Reads DATABASE_URL (env or backend/.env) and derives <name>_test.
//   2. `prisma migrate deploy` (creates the test DB if missing, never drops anything)
//      then the deterministic seed — only ever against the *_test database.
//   3. Imports createApp() and listens on an ephemeral port; tests talk HTTP to it.
//
// Set TEST_BASE_URL to run the suite against an already-running API instead.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

const root = fileURLToPath(new URL("../..", import.meta.url));
const isWin = process.platform === "win32";

function loadDotEnv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

export function testDatabaseUrl(url: string): string {
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, "");
  if (!name) throw new Error("DATABASE_URL has no database name");
  u.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return u.toString();
}

export default async function setup(project: TestProject) {
  if (process.env.TEST_BASE_URL) {
    project.provide("baseUrl", process.env.TEST_BASE_URL);
    return;
  }
  loadDotEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (run `npm run setup` at the repo root first)");
  const dbUrl = testDatabaseUrl(process.env.DATABASE_URL);
  if (!new URL(dbUrl).pathname.endsWith("_test")) throw new Error("Refusing to touch a non-_test database");

  // Everything below (Prisma CLI + the in-process app) uses the test database and a throwaway upload dir.
  Object.assign(process.env, {
    DATABASE_URL: dbUrl,
    UPLOAD_DIR: path.join(root, ".test-uploads"),
    RATE_LIMIT_MULTIPLIER: "50",
    DISABLE_REMINDER_SCHEDULER: "true",
    NOTIFY_MODE: "test", // SMS go to an in-memory outbox readable via /api/__test/outbox
    GEOCODER: "off",
  });

  console.log(`\n[integration] preparing ${new URL(dbUrl).pathname.slice(1)} (migrate deploy + seed)…`);
  for (const cmd of [["prisma", "migrate", "deploy"], ["prisma", "db", "seed"]]) {
    const r = spawnSync("npx", cmd, { cwd: root, env: process.env, shell: isWin, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${cmd.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
  }

  const { createApp } = await import("../../src/app");
  const { prisma } = await import("../../src/config/db");
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  console.log(`[integration] Express API on http://localhost:${port}/api`);
  project.provide("baseUrl", `http://localhost:${port}`);

  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    fs.rmSync(path.join(root, ".test-uploads"), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
}
