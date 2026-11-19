import { Router } from "express";
import * as pets from "../controllers/pet.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const petRoutes = Router()
  .get("/pets", requireAuth, pets.list)
  .post("/pets", requireRole(["PET_OWNER"]), pets.create)
  .get("/pets/:id", requireAuth, pets.get)
  .put("/pets/:id", requireAuth, pets.update)
  .delete("/pets/:id", requireAuth, pets.remove)
  .post("/pets/:id/lost", requireAuth, pets.markLost)
  .post("/pets/:id/found", requireAuth, pets.markFound)
  .get("/pets/:id/qr", requireAuth, pets.qr)
  .get("/pets/:id/certificate", requireAuth, pets.certificate)
  // lost pets & QR scans
  .get("/lost-reports", pets.listLost) // public (coarse) or privileged (full)
  .get("/lost-reports/:id", requireAuth, pets.getLost)
  .put("/lost-reports/:id", requireAuth, pets.updateLost)
  .get("/qr-scans", requireAuth, pets.listScans)
  // public QR emergency profile (Section K.5)
  .get("/public/pets/:token", pets.publicProfile)
  .post("/public/pets/:token/scan", pets.publicScan);
