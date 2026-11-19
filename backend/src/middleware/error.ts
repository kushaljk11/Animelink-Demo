// Centralised error handling: every thrown error becomes { error: { code, message, details? } }.
import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { ApiError } from "../utils/http";

const body = (code: string, message: string, details?: unknown) => ({ error: { code, message, ...(details === undefined ? {} : { details }) } });

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(body("NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) return void res.status(err.status).json(body(err.code, err.message, err.details));
  // Malformed input → 400 Bad Request; code VALIDATION_ERROR + per-field messages distinguish it from other 400s.
  if (err instanceof ZodError) return void res.status(400).json(body("VALIDATION_ERROR", "Request validation failed", err.flatten()));
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    return void res.status(tooBig ? 413 : 400).json(body(tooBig ? "FILE_TOO_LARGE" : "BAD_UPLOAD", tooBig ? "Image is too large" : err.message));
  }
  // body-parser errors
  if (err?.type === "entity.parse.failed") return void res.status(400).json(body("BAD_REQUEST", "Request body must be valid JSON"));
  if (err?.type === "entity.too.large") return void res.status(413).json(body("PAYLOAD_TOO_LARGE", "Request body is too large"));
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return void res.status(409).json(body("CONFLICT", `A record with this ${String(err.meta?.target ?? "field")} already exists`));
    if (err.code === "P2025") return void res.status(404).json(body("NOT_FOUND", "Record not found"));
    if (err.code === "P2003") return void res.status(409).json(body("CONFLICT", "Operation violates a relation to another record"));
  }
  console.error("[api] unhandled error", err);
  res.status(500).json(body("INTERNAL_ERROR", "Something went wrong"));
};
