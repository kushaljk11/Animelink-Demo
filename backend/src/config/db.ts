import { PrismaClient } from "@prisma/client";

// One client per process. In dev, Next.js hot-reload re-evaluates modules, so the
// client is parked on globalThis to avoid exhausting SQLite file handles.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    // Query errors surface through the error middleware; Prisma's own error log would also print
    // handled cases such as notification dedupe-key collisions (P2002), so keep it to warnings.
    log: ["warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;
