#!/usr/bin/env node
// One-command local bootstrap for the decoupled stack (needs only Node + PostgreSQL):
//   Node check → install root/backend/frontend deps → backend/.env + frontend/.env.local
//   → uploads dir → PostgreSQL reachability → prisma generate → migrate deploy → seed
//   → API (:5000) + Web (:3000) together via concurrently
//
//   npm run setup                     everything, then both dev servers
//   npm run setup -- --no-dev         prepare only
//   npm run setup -- --keep-data      don't reseed when users already exist
//   npm run setup -- --skip-install   never run npm install
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const args = new Set(process.argv.slice(2));
const isWin = process.platform === "win32";
const c = { cyan: (s) => `\x1b[36m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m` };

const step = (t) => console.log(`\n${c.cyan(`▸ ${t}`)}`);
const fail = (msg, hint) => {
  console.error(`\n${c.red(`✖ ${msg}`)}`);
  if (hint) console.error(hint);
  process.exit(1);
};
function run(cmd, cmdArgs, { cwd = root, capture = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: capture ? "pipe" : "inherit", encoding: "utf8", shell: isWin });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const canConnect = (host, port) =>
  new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (v) => (s.destroy(), resolve(v));
    s.setTimeout(3000, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });

// 1. Node -------------------------------------------------------------------
step("Checking Node.js");
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 20 || (maj === 20 && min < 12)) fail(`Node ${process.versions.node} is too old`, "Install Node.js 20.12+ (22 LTS recommended): https://nodejs.org");
console.log(`  node ${process.versions.node} ✓`);

// 2. Dependencies -----------------------------------------------------------
step("Dependencies (root · backend · frontend)");
const installed = (dir, probe) => fs.existsSync(path.join(dir, "node_modules", ...probe.split("/"), "package.json"));
for (const [label, dir, probe] of [["root", root, "concurrently"], ["backend", backend, "express"], ["frontend", frontend, "next"]]) {
  if (args.has("--skip-install") || installed(dir, probe)) {
    console.log(`  ${label}: node_modules present`);
    continue;
  }
  console.log(`  ${label}: installing…`);
  if (!run("npm", [fs.existsSync(path.join(dir, "package-lock.json")) ? "ci" : "install"], { cwd: dir }).ok) fail(`npm install failed in ${label}/`);
}

// 3. Environment files ------------------------------------------------------
step("Environment files");
const backendEnv = path.join(backend, ".env");
if (!fs.existsSync(backendEnv)) {
  const tpl = fs.readFileSync(path.join(backend, ".env.example"), "utf8").replace(/^JWT_SECRET=.*$/m, `JWT_SECRET="${randomBytes(32).toString("hex")}"`);
  fs.writeFileSync(backendEnv, tpl);
  console.log("  created backend/.env from backend/.env.example (fresh JWT_SECRET)");
} else console.log("  backend/.env exists — left untouched");
const frontendEnv = path.join(frontend, ".env.local");
if (!fs.existsSync(frontendEnv)) {
  fs.copyFileSync(path.join(frontend, ".env.example"), frontendEnv);
  console.log("  created frontend/.env.local (NEXT_PUBLIC_API_URL=http://localhost:5000/api)");
} else console.log("  frontend/.env.local exists — left untouched");

const env = { ...readEnvFile(backendEnv), ...process.env };
if (!env.DATABASE_URL) fail("DATABASE_URL is not set in backend/.env");

// 4. Uploads ----------------------------------------------------------------
step("Upload storage (backend/uploads)");
for (const sub of ["", "pets", "incidents", "strays", "breed", "seed"]) fs.mkdirSync(path.join(backend, env.UPLOAD_DIR ?? "uploads", sub), { recursive: true });
console.log("  ready (served by the API at /uploads/*; incident photos are access-controlled)");

// 5. Database ---------------------------------------------------------------
step("Database");
let db;
try {
  db = new URL(env.DATABASE_URL);
} catch {
  fail("DATABASE_URL in backend/.env is not a valid URL");
}
const host = db.hostname || "localhost";
const port = Number(db.port || 5432);
console.log(`  PostgreSQL ${host}:${port} / database "${db.pathname.slice(1)}"`);
if (!(await canConnect(host, port))) {
  fail(`Cannot reach PostgreSQL at ${host}:${port}`, "  Start PostgreSQL (or: docker run -d --name rtn-pg -e POSTGRES_USER=rtn -e POSTGRES_PASSWORD=rtn -p 5432:5432 postgres:16)\n  and make DATABASE_URL in backend/.env match.");
}

step("Prisma client");
const gen = run("npx", ["prisma", "generate"], { cwd: backend, capture: true });
if (!gen.ok) {
  if (/EPERM|EBUSY/.test(gen.out) && fs.existsSync(path.join(backend, "node_modules", ".prisma", "client", "index.js"))) {
    console.log("  ⚠ engine file is locked (is the API already running?) — keeping the existing generated client");
  } else {
    console.error(gen.out);
    fail("prisma generate failed");
  }
} else console.log("  generated ✓");

step("Migrations (creates the database if it does not exist; never drops data)");
const mig = run("npx", ["prisma", "migrate", "deploy"], { cwd: backend, capture: true });
process.stdout.write(c.dim(mig.out.split(/\r?\n/).filter((l) => l && !/deprecated|pris\.ly\/prisma-config/.test(l)).map((l) => `  ${l}`).join("\n")) + "\n");
if (!mig.ok) {
  if (/P3005/.test(mig.out)) fail(`Database "${db.pathname.slice(1)}" already contains another application's tables`, "  Point DATABASE_URL in backend/.env at a new database name (e.g. …/rabies_track) — it is created automatically.");
  if (/P1000/.test(mig.out)) fail("PostgreSQL rejected the username/password in DATABASE_URL");
  fail("prisma migrate deploy failed (see output above)");
}

let seed = true;
if (args.has("--keep-data")) {
  const probe = run("node", ["-e", "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(n=>{console.log('USERS='+n);return p.$disconnect()}).catch(()=>console.log('USERS=0'))"], { cwd: backend, capture: true });
  const n = Number(probe.out.match(/USERS=(\d+)/)?.[1] ?? 0);
  if (n > 0) {
    seed = false;
    console.log(`\n  --keep-data: ${n} users found, skipping seed`);
  }
}
if (seed) {
  step("Seeding test data (wipes and rebuilds the local dataset)");
  if (!run("npx", ["prisma", "db", "seed"], { cwd: backend }).ok) fail("Seeding failed");
}

console.log(`\n${c.green("✔ Local environment ready.")}`);
console.log("  API  http://localhost:5000/api   ·   Web  http://localhost:3000");
console.log("  Logins: admin@local.dev / Admin@1234 · operator@local.dev / Operator@1234 · user@local.dev / User@1234");
if (args.has("--no-dev")) {
  console.log("  Start both with: npm run dev");
  process.exit(0);
}
step("Starting API (:5000) and Web (:3000) — Ctrl+C stops both");
run("npm", ["run", "dev"]);
