import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { authenticate } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { apiRouter } from "./routes";
import { fileRoutes } from "./routes/platform.routes";
import { withBSDates } from "./services/date.service";

/** Builds the Express app (exported separately from server.ts so tests can mount it on an ephemeral port). */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");

  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true, // the session is an httpOnly cookie
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposedHeaders: ["Content-Disposition", "X-QR-Target"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY" });
    next();
  });
  app.use(authenticate); // req.user for every request (null when anonymous)
  // Dual calendar: every Date in a JSON response gains a sibling "<key>BS" (e.g. createdAtBS: "2083-07-23").
  app.use((_req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body?: unknown) => json(withBSDates(body));
    next();
  });

  app.get("/", (_req, res) => res.json({ name: "Rabies Track Nepal API", docs: "/api/health", version: "1.0.0" }));
  app.use("/api", apiRouter);
  app.use(fileRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
