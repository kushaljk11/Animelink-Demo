// Rabies Track Nepal — API server entry point (http://localhost:5000).
import { createApp } from "./app";
import { prisma } from "./config/db";
import { env } from "./config/env";
import { startReminderScheduler } from "./services/reminders";

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`▶ API listening on http://localhost:${env.port}/api  (CORS: ${env.corsOrigins.join(", ")})`);
  if (process.env.DISABLE_REMINDER_SCHEDULER !== "true") startReminderScheduler(); // replaces Redis/BullMQ (Section P.4)
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received — closing server`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
