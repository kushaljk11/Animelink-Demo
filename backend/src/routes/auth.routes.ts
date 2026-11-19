import { Router } from "express";
import * as auth from "../controllers/auth.controller";
import * as users from "../controllers/user.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const authRoutes = Router()
  .post("/auth/register", auth.register)
  .post("/auth/login", auth.login)
  .post("/auth/logout", auth.logout)
  .get("/auth/me", requireAuth, auth.me)
  .patch("/auth/me", requireAuth, auth.updateMe)
  .post("/auth/password", requireAuth, auth.changePassword)
  .get("/auth/switch-role", auth.listDemoAccounts)
  .post("/auth/switch-role", auth.switchRole);

export const userRoutes = Router()
  .use("/users", requireRole(["ADMIN"]))
  .get("/users", users.list)
  .post("/users", users.create)
  .get("/users/:id", users.get)
  .put("/users/:id", users.update)
  .delete("/users/:id", users.deactivate);
