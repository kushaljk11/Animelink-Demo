import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import { audit } from "../services/audit";
import * as users from "../services/user.service";
import { parseBody, parseList, param } from "../utils/http";
import { adminCreateUserSchema, adminUpdateUserSchema } from "../validators";

export async function list(req: Request, res: Response) {
  res.json(await users.listUsers(parseList(req, ["createdAt", "fullName", "email", "role", "municipality"], "createdAt")));
}

export async function create(req: Request, res: Response) {
  const admin = currentUser(req);
  const user = await users.adminCreateUser(parseBody(req, adminCreateUserSchema));
  await audit({ actorId: admin.id, action: "USER_REGISTERED", entityType: "User", entityId: user.id, after: { role: user.role, by: "admin" }, req });
  res.status(201).json(users.safeUser(user));
}

export async function get(req: Request, res: Response) {
  res.json(await users.getUser(param(req, "id")));
}

export async function update(req: Request, res: Response) {
  const admin = currentUser(req);
  const body = parseBody(req, adminUpdateUserSchema);
  const { before, user } = await users.adminUpdateUser(admin, param(req, "id"), body);
  await audit({
    actorId: admin.id,
    action: body.isActive === false ? "USER_DEACTIVATED" : "USER_UPDATED",
    entityType: "User",
    entityId: user.id,
    before: { role: before.role, isActive: before.isActive, municipality: before.municipality, wardNumber: before.wardNumber },
    after: body,
    req,
  });
  res.json(users.safeUser(user));
}

export async function deactivate(req: Request, res: Response) {
  const admin = currentUser(req);
  const user = await users.deactivateUser(admin, param(req, "id"));
  await audit({ actorId: admin.id, action: "USER_DEACTIVATED", entityType: "User", entityId: user.id, req });
  res.json({ id: user.id, isActive: false });
}
