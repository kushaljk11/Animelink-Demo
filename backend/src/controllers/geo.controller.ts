import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import * as geocode from "../services/geocode";
import * as geo from "../services/geo-query.service";
import { clientIp, parseQuery, rateLimit } from "../utils/http";
import { clusterQuerySchema, mapQuerySchema, nearbyQuerySchema, placeSearchSchema, reverseQuerySchema, riskQuerySchema, withinQuerySchema } from "../validators";

export async function nearby(req: Request, res: Response) {
  rateLimit(`nearby:${clientIp(req)}`, 120, 10 * 60_000);
  res.json(await geo.nearby(parseQuery(req, nearbyQuerySchema)));
}

export async function within(req: Request, res: Response) {
  res.json(await geo.within(req.user, parseQuery(req, withinQuerySchema)));
}

export async function clusters(req: Request, res: Response) {
  res.json(await geo.clusters(currentUser(req), parseQuery(req, clusterQuerySchema)));
}

export async function riskAreas(req: Request, res: Response) {
  if (!req.user) rateLimit(`risk:${clientIp(req)}`, 60, 10 * 60_000);
  res.json(await geo.riskAreas(req.user, parseQuery(req, riskQuerySchema)));
}

export async function map(req: Request, res: Response) {
  res.json(await geo.mapLayers(req.user, parseQuery(req, mapQuerySchema)));
}

/** Pin → municipality / ward / landmark (public: the guest report wizard uses it). */
export async function reverse(req: Request, res: Response) {
  rateLimit(`geocode:${clientIp(req)}`, 60, 10 * 60_000);
  const { lat, lng } = parseQuery(req, reverseQuerySchema);
  res.json(await geocode.reverseGeocode({ lat, lng }));
}

/** Municipality autocomplete: known municipalities first, then OpenStreetMap settlements in Nepal. */
export async function places(req: Request, res: Response) {
  rateLimit(`places:${clientIp(req)}`, 120, 10 * 60_000);
  const { q, lookup } = parseQuery(req, placeSearchSchema);
  res.json({ data: await geocode.searchPlaces(q, lookup) });
}

/** Municipalities present in the data (filter options). */
export async function municipalities(_req: Request, res: Response) {
  res.json({ data: await geocode.knownMunicipalities() });
}
