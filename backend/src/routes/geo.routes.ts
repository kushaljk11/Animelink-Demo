import { Router } from "express";
import * as geo from "../controllers/geo.controller";
import { requireAuth, requireRole } from "../middleware/auth";

/** Geospatial endpoints (Section S). Haversine/bbox/DBSCAN live in services/geo*.ts. */
export const geoRoutes = Router()
  .get("/geo/nearby", geo.nearby) // public
  .get("/geo/reverse", geo.reverse) // public, rate-limited
  .get("/geo/places", geo.places) // public, rate-limited
  .get("/geo/municipalities", requireAuth, geo.municipalities)
  .get("/geo/within", geo.within) // per-layer RBAC inside
  .get("/geo/clusters", requireRole(["WARD_OFFICER", "RESCUE_ORG"]), geo.clusters)
  .get("/geo/risk-areas", geo.riskAreas) // aggregated, public
  .get("/geo/map", geo.map); // GeoJSON layers; restricted layers listed in `hidden`
