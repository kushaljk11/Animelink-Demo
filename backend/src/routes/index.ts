import { Router } from "express";
import { authRoutes, userRoutes } from "./auth.routes";
import { domainRoutes } from "./domain.routes";
import { geoRoutes } from "./geo.routes";
import { publicRoutes } from "./public.routes";
import { directoryRoutes, vaccinationRoutes } from "./health-records.routes";
import { petRoutes } from "./pets.routes";
import { platformRoutes } from "./platform.routes";
import { statsRoutes } from "./stats.routes";

/** Everything under /api. */
export const apiRouter = Router()
  .use(authRoutes)
  .use(userRoutes)
  .use(petRoutes)
  .use(vaccinationRoutes)
  .use(directoryRoutes)
  .use(domainRoutes)
  .use(geoRoutes)
  .use(publicRoutes)
  .use(statsRoutes)
  .use(platformRoutes);
