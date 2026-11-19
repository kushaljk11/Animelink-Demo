// Duplicate stray detection / re-identification (Sections H.10, H.18, L.17).
// Scores existing records on tag, distance, photo similarity and descriptive
// attributes. It *assists* human review (Section V) — it never merges records.
import type { CommunityStray, Gender, Species } from "@prisma/client";
import { prisma } from "../config/db";
import { boundingBox, bboxWhere, haversineKm } from "./geo";
import { dHash, hashSimilarity } from "./image";
import { resolveUploadPath } from "./uploads";

export type DuplicateQuery = {
  tagOrEarMark?: string | null;
  species?: Species;
  gender?: Gender;
  color?: string | null;
  breed?: string | null;
  physicalDescription?: string | null;
  photoUrl?: string | null;
  latitude: number;
  longitude: number;
  radiusKm?: number;
  excludeId?: string;
};

export type DuplicateCandidate = {
  stray: CommunityStray & { cnvrCount: number; lastCnvrAt: Date | null; sterilized: boolean; vaccinated: boolean };
  score: number;
  likelihood: "LIKELY" | "POSSIBLE";
  distanceKm: number;
  reasons: string[];
};

const STOPWORDS = new Set(["the", "a", "an", "and", "with", "on", "of", "in", "near", "dog", "cat", "has", "is", "very", "little", "small"]);

const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, " ").trim();
const normTag = (s?: string | null) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const tokens = (s?: string | null) => new Set(norm(s).split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t)));

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

async function safeHash(url?: string | null): Promise<bigint | null> {
  if (!url) return null;
  const abs = resolveUploadPath(url);
  if (!abs) return null;
  try {
    return await dHash(abs);
  } catch {
    return null;
  }
}

export async function findDuplicateCandidates(q: DuplicateQuery, limit = 10): Promise<DuplicateCandidate[]> {
  const radiusKm = q.radiusKm ?? 2;
  const center = { lat: q.latitude, lng: q.longitude };
  const tag = normTag(q.tagOrEarMark);

  const pool = await prisma.communityStray.findMany({
    where: {
      ...(q.excludeId ? { id: { not: q.excludeId } } : {}),
      ...(q.species ? { species: q.species } : {}),
      OR: [
        bboxWhere(boundingBox(center, radiusKm), "latitude", "longitude"),
        // A matching tag is strong evidence even if the dog has roamed further.
        ...(tag.length >= 3 && q.tagOrEarMark ? [{ tagOrEarMark: { contains: q.tagOrEarMark.trim(), mode: "insensitive" as const } }] : []),
      ],
    },
    include: {
      cnvrRecords: {
        select: { createdAt: true, sterilizationDate: true, vaccinationDate: true },
        orderBy: { createdAt: "desc" },
      },
    },
    take: 300,
  });

  const queryHash = await safeHash(q.photoUrl);
  const qColor = tokens(q.color);
  const qDesc = tokens(q.physicalDescription);
  const out: DuplicateCandidate[] = [];

  for (const s of pool) {
    const reasons: string[] = [];
    let score = 0;
    const d = haversineKm(center, { lat: s.latitude, lng: s.longitude });

    const sTag = normTag(s.tagOrEarMark);
    if (tag && sTag) {
      if (tag === sTag) {
        score += 0.55;
        reasons.push(`Same tag / ear mark (${s.tagOrEarMark})`);
      } else if (tag.length >= 3 && sTag.length >= 3 && (tag.includes(sTag) || sTag.includes(tag))) {
        score += 0.3;
        reasons.push(`Similar tag / ear mark (${s.tagOrEarMark})`);
      }
    }

    if (d <= radiusKm) {
      score += 0.2 * (1 - d / radiusKm);
      reasons.push(`${d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`} from this location`);
    }

    if (q.gender && q.gender !== "UNKNOWN" && s.gender !== "UNKNOWN") {
      if (q.gender === s.gender) {
        score += 0.05;
      } else {
        score -= 0.2;
        reasons.push("Different gender recorded");
      }
    }

    const colorSim = jaccard(qColor, tokens(s.color));
    if (colorSim > 0) {
      score += 0.1 * colorSim;
      if (colorSim >= 0.5) reasons.push(`Similar colour (${s.color})`);
    }

    if (q.breed && s.breed && norm(q.breed) === norm(s.breed)) {
      score += 0.05;
      reasons.push(`Same breed (${s.breed})`);
    }

    const descSim = jaccard(qDesc, tokens(s.physicalDescription));
    if (descSim > 0) {
      score += 0.1 * Math.min(1, descSim * 2);
      if (descSim >= 0.2) reasons.push("Overlapping physical description");
    }

    if (queryHash !== null && s.photoUrl) {
      const h = await safeHash(s.photoUrl);
      if (h !== null) {
        const sim = hashSimilarity(queryHash, h);
        if (sim > 0.6) {
          score += 0.25 * ((sim - 0.6) / 0.4);
          reasons.push(`Photo similarity ${(sim * 100).toFixed(0)}%`);
        }
      }
    }

    score = Math.max(0, Math.min(1, score));
    if (score < 0.3) continue;

    const { cnvrRecords, ...stray } = s;
    out.push({
      stray: {
        ...stray,
        cnvrCount: cnvrRecords.length,
        lastCnvrAt: cnvrRecords[0]?.createdAt ?? null,
        sterilized: cnvrRecords.some((c) => c.sterilizationDate),
        vaccinated: cnvrRecords.some((c) => c.vaccinationDate),
      },
      score: Math.round(score * 1000) / 1000,
      likelihood: score >= 0.6 ? "LIKELY" : "POSSIBLE",
      distanceKm: Math.round(d * 1000) / 1000,
      reasons,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
