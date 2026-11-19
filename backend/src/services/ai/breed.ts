// Offline breed suggestion engine (Section T.1).
//
// No paid API, no network. This is a transparent heuristic, not a trained
// vision model: it measures the coat-colour distribution of the photo's centre
// crop and ranks breeds by colour-profile similarity weighted by how common the
// breed is among pets in urban Nepal. Confidence is deliberately capped so the
// UI always presents the output as a *suggestion* the owner confirms or edits.
//
// Swapping in a real model only requires another BreedPredictor implementation.
import type { Species } from "@prisma/client";
import { COAT_CLASSES, imageProfile, type CoatClass, type ImageProfile } from "../image";

export type BreedSuggestion = { breed: string; score: number };
export type BreedPrediction = {
  predictedBreed: string;
  confidence: number;
  alternatives: BreedSuggestion[];
  modelVersion: string;
  observations: { dominantColours: { colour: CoatClass; share: number }[]; multiColoured: boolean };
  disclaimer: string;
};

export interface BreedPredictor {
  readonly version: string;
  predict(image: Buffer, species: Species): Promise<BreedPrediction>;
}

type Profile = { breed: string; prior: number; coat: Partial<Record<CoatClass, number>>; patterned?: boolean };

const DOG_PROFILES: Profile[] = [
  { breed: "Local Nepali / Mixed breed", prior: 0.3, coat: { brown: 0.25, tan: 0.25, black: 0.2, cream: 0.1, white: 0.1, golden: 0.1 } },
  { breed: "Labrador Retriever", prior: 0.1, coat: { golden: 0.35, cream: 0.25, black: 0.3, brown: 0.1 } },
  { breed: "German Shepherd", prior: 0.1, coat: { black: 0.4, tan: 0.35, brown: 0.25 }, patterned: true },
  { breed: "Japanese Spitz", prior: 0.07, coat: { white: 0.75, cream: 0.25 } },
  { breed: "Golden Retriever", prior: 0.06, coat: { golden: 0.6, cream: 0.25, tan: 0.15 } },
  { breed: "Pomeranian", prior: 0.04, coat: { golden: 0.35, cream: 0.3, white: 0.2, tan: 0.15 } },
  { breed: "Lhasa Apso", prior: 0.04, coat: { cream: 0.35, golden: 0.25, white: 0.2, grey: 0.2 } },
  { breed: "Shih Tzu", prior: 0.04, coat: { white: 0.4, cream: 0.2, golden: 0.2, brown: 0.2 }, patterned: true },
  { breed: "Tibetan Mastiff", prior: 0.04, coat: { black: 0.55, tan: 0.3, brown: 0.15 } },
  { breed: "Himalayan Sheepdog (Bhote Kukur)", prior: 0.04, coat: { black: 0.6, tan: 0.25, white: 0.15 } },
  { breed: "Siberian Husky", prior: 0.04, coat: { white: 0.4, grey: 0.4, black: 0.2 }, patterned: true },
  { breed: "Pug", prior: 0.03, coat: { cream: 0.35, tan: 0.35, black: 0.3 } },
  { breed: "Rottweiler", prior: 0.03, coat: { black: 0.7, tan: 0.3 }, patterned: true },
  { breed: "Beagle", prior: 0.02, coat: { tan: 0.35, white: 0.35, black: 0.2, brown: 0.1 }, patterned: true },
  { breed: "Dobermann", prior: 0.02, coat: { black: 0.65, brown: 0.2, tan: 0.15 }, patterned: true },
];

const CAT_PROFILES: Profile[] = [
  { breed: "Domestic Shorthair", prior: 0.6, coat: { brown: 0.2, tan: 0.2, grey: 0.2, black: 0.15, white: 0.15, golden: 0.1 } },
  { breed: "Persian", prior: 0.15, coat: { white: 0.5, cream: 0.25, grey: 0.25 } },
  { breed: "Siamese", prior: 0.08, coat: { cream: 0.55, brown: 0.3, white: 0.15 }, patterned: true },
  { breed: "Himalayan (Colourpoint Persian)", prior: 0.07, coat: { cream: 0.55, white: 0.2, brown: 0.25 }, patterned: true },
  { breed: "Bengal", prior: 0.05, coat: { golden: 0.35, tan: 0.35, black: 0.3 }, patterned: true },
  { breed: "British Shorthair", prior: 0.05, coat: { grey: 0.8, white: 0.2 } },
];

function vector(coat: Partial<Record<CoatClass, number>>): number[] {
  return COAT_CLASSES.map((c) => coat[c] ?? 0);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const MAX_CONFIDENCE = 0.75;

export function rankBreeds(profile: ImageProfile, species: Species): BreedSuggestion[] {
  const profiles = species === "CAT" ? CAT_PROFILES : DOG_PROFILES;
  const observed = vector(profile.coat);
  const multi = profile.diversity > 0.55;
  const raw = profiles.map((p) => {
    let sim = cosine(observed, vector(p.coat));
    if (p.patterned && multi) sim *= 1.1;
    if (p.patterned && !multi) sim *= 0.9;
    return { breed: p.breed, w: Math.max(sim, 0) ** 3 * p.prior ** 0.35 };
  });
  const total = raw.reduce((s, r) => s + r.w, 0) || 1;
  return raw
    .map((r) => ({ breed: r.breed, score: Math.round((r.w / total) * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score);
}

export const heuristicBreedPredictor: BreedPredictor = {
  version: "heuristic-coat-v1",
  async predict(image, species) {
    const profile = await imageProfile(image);
    const dominantColours = COAT_CLASSES.map((c) => ({ colour: c, share: Math.round(profile.coat[c] * 100) / 100 }))
      .filter((c) => c.share >= 0.08)
      .sort((a, b) => b.share - a.share);
    const disclaimer =
      "This is an automated suggestion based on coat colour, not a confirmed identification. Mixed breeds, lighting and photo angle affect the result — please confirm or correct it.";

    if (species === "OTHER") {
      return {
        predictedBreed: "Unknown",
        confidence: 0,
        alternatives: [],
        modelVersion: this.version,
        observations: { dominantColours, multiColoured: profile.diversity > 0.55 },
        disclaimer,
      };
    }
    const ranked = rankBreeds(profile, species);
    const top = ranked[0]!;
    return {
      predictedBreed: top.breed,
      confidence: Math.round(Math.min(MAX_CONFIDENCE, top.score) * 1000) / 1000,
      alternatives: ranked.slice(1, 5),
      modelVersion: this.version,
      observations: { dominantColours, multiColoured: profile.diversity > 0.55 },
      disclaimer,
    };
  },
};

export const breedPredictor: BreedPredictor = heuristicBreedPredictor;
