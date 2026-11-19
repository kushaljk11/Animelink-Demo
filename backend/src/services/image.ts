// Local image analysis primitives shared by uploads, the breed finder and stray re-identification.
import sharp from "sharp";

// libvips keeps opened files cached; on Windows that blocks deleting/replacing uploads it has read.
sharp.cache({ files: 0 });

/**
 * 64-bit difference hash (dHash). Robust to rescaling/re-encoding; Hamming
 * distance ≤ ~10 usually means the same photo or a very similar framing.
 */
export async function dHash(input: Buffer | string): Promise<bigint> {
  const { data } = await sharp(input)
    .rotate()
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x]!;
      const right = data[y * 9 + x + 1]!;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** 0..1 similarity from two dHashes. */
export function hashSimilarity(a: bigint, b: bigint): number {
  return 1 - hammingDistance(a, b) / 64;
}

export type CoatClass = "black" | "white" | "cream" | "golden" | "brown" | "grey" | "tan";
export const COAT_CLASSES: CoatClass[] = ["black", "white", "cream", "golden", "brown", "grey", "tan"];

function classify(r: number, g: number, b: number): CoatClass {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  let h = 0;
  if (max !== min) {
    if (max === r) h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  if (v < 0.22) return "black";
  if (s < 0.12) return v > 0.8 ? "white" : "grey";
  if (h >= 20 && h <= 55) {
    if (v > 0.78 && s < 0.35) return "cream";
    if (v > 0.55) return "golden";
    return "tan";
  }
  if (h < 20 || h > 330) return v > 0.5 ? "tan" : "brown";
  if (s < 0.25) return v > 0.7 ? "cream" : "grey";
  return "brown";
}

export type ImageProfile = {
  width: number;
  height: number;
  /** Share of each coat colour class in the centre crop (sums to 1). */
  coat: Record<CoatClass, number>;
  /** Colour variety 0..1 — high values suggest multi-coloured / patterned coats. */
  diversity: number;
};

/** Coat colour distribution of the central 60% of the image (where the animal usually is). */
export async function imageProfile(input: Buffer): Promise<ImageProfile> {
  const img = sharp(input).rotate();
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const { data, info } = await img
    .clone()
    .removeAlpha()
    .resize(80, 80, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const coat = Object.fromEntries(COAT_CLASSES.map((c) => [c, 0])) as Record<CoatClass, number>;
  const lo = Math.floor(info.width * 0.2);
  const hi = Math.ceil(info.width * 0.8);
  let total = 0;
  for (let y = lo; y < hi; y++) {
    for (let x = lo; x < hi; x++) {
      const i = (y * info.width + x) * info.channels;
      coat[classify(data[i]!, data[i + 1]!, data[i + 2]!)] += 1;
      total++;
    }
  }
  for (const c of COAT_CLASSES) coat[c] = total ? coat[c] / total : 0;
  const entropy = -COAT_CLASSES.reduce((s, c) => (coat[c] > 0 ? s + coat[c] * Math.log(coat[c]) : s), 0);
  return { width, height, coat, diversity: entropy / Math.log(COAT_CLASSES.length) };
}
