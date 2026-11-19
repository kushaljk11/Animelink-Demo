// Surveillance domain: bite incidents, community strays and CNVR.
import { Router } from "express";
import * as community from "../controllers/community.controller";
import * as incidents from "../controllers/incident.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const strayViewers = requireRole(["RESCUE_ORG", "WARD_OFFICER", "VET_CLINIC"]);
const strayManagers = requireRole(["RESCUE_ORG"]);

export const domainRoutes = Router()
  // incidents
  .get("/incidents", requireAuth, incidents.list)
  .post("/incidents", incidents.create) // guests allowed (rate-limited, phone required)
  .get("/incidents/:id", requireAuth, incidents.get)
  .put("/incidents/:id", requireAuth, incidents.update)
  .delete("/incidents/:id", requireAuth, incidents.remove)
  .patch("/incidents/:id/status", requireRole(["WARD_OFFICER", "RESCUE_ORG"]), incidents.transition) // rescue orgs: only cases they handle
  .get("/incidents/:id/assignees", requireRole(["WARD_OFFICER"]), incidents.assignees)
  .patch("/incidents/:id/assign", requireRole(["WARD_OFFICER"]), incidents.assign)
  .post("/incidents/:id/claim", requireRole(["WARD_OFFICER", "RESCUE_ORG"]), incidents.claim)
  .post("/incidents/:id/release", requireRole(["WARD_OFFICER", "RESCUE_ORG"]), incidents.release)
  .get("/public/incidents/:code", incidents.track)
  // community strays
  .get("/strays", strayViewers, community.listStrays)
  .post("/strays", strayManagers, community.createStray)
  .post("/strays/duplicates", strayViewers, community.duplicates)
  .get("/strays/:id", strayViewers, community.getStray)
  .put("/strays/:id", strayManagers, community.updateStray)
  .delete("/strays/:id", strayManagers, community.deleteStray)
  // CNVR
  .get("/cnvr", strayViewers, community.listCnvr)
  .post("/cnvr", requireRole(["RESCUE_ORG"]), community.createCnvr)
  .get("/cnvr/:id", strayViewers, community.getCnvr)
  .put("/cnvr/:id", requireAuth, community.updateCnvr)
  .delete("/cnvr/:id", requireAuth, community.deleteCnvr);
