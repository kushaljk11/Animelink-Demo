// Vaccination records + clinic / rescue-organisation directories.
import { Router } from "express";
import { directoryController } from "../controllers/directory.controller";
import * as vax from "../controllers/vaccination.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const clinics = directoryController("clinics");
const orgs = directoryController("organizations");

export const vaccinationRoutes = Router()
  .get("/vaccinations", requireAuth, vax.list)
  .post("/vaccinations", requireRole(["VET_CLINIC", "PET_OWNER"]), vax.create)
  .get("/vaccinations/:id", requireAuth, vax.get)
  .put("/vaccinations/:id", requireAuth, vax.update)
  .delete("/vaccinations/:id", requireAuth, vax.remove)
  .post("/vaccinations/:id/verify", requireRole(["VET_CLINIC"]), vax.decide);

export const directoryRoutes = Router()
  .get("/clinics", clinics.list) // public: verified only
  .post("/clinics", requireRole(["VET_CLINIC"]), clinics.create)
  .get("/clinics/:id", clinics.get)
  .put("/clinics/:id", requireAuth, clinics.update)
  .delete("/clinics/:id", requireAuth, clinics.remove)
  .post("/clinics/:id/verification", requireRole(["ADMIN"]), clinics.verify)
  .get("/organizations", orgs.list)
  .post("/organizations", requireRole(["RESCUE_ORG"]), orgs.create)
  .get("/organizations/:id", orgs.get)
  .put("/organizations/:id", requireAuth, orgs.update)
  .delete("/organizations/:id", requireAuth, orgs.remove)
  .post("/organizations/:id/verification", requireRole(["ADMIN"]), orgs.verify);
