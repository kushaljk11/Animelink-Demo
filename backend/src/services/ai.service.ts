// AI features (Section T): offline breed suggestion + bilingual guidance chatbot, both logged for evaluation.
import { randomBytes } from "node:crypto";
import type { Locale, Species } from "@prisma/client";
import { prisma } from "../config/db";
import { badRequest, forbidden, notFound } from "../utils/http";
import { breedPredictor } from "./ai/breed";
import { CHATBOT_VERSION, reply, scrubPii } from "./ai/chatbot";
import type { SessionUser } from "./auth.service";

async function assertOwnPet(user: SessionUser, petId: string) {
  const pet = await prisma.pet.findUnique({ where: { id: petId }, select: { ownerId: true } });
  if (!pet) throw badRequest("Pet not found");
  if (pet.ownerId !== user.id && user.role !== "ADMIN") throw forbidden("You can only use the breed finder for your own pets");
}

/** Runs the predictor on an (already sanitised) image and logs the prediction. */
export async function predictBreed(user: SessionUser, image: Buffer, imageUrl: string, species: Species, petId?: string) {
  if (petId) await assertOwnPet(user, petId);
  const started = Date.now();
  const prediction = await breedPredictor.predict(image, species);
  const record = await prisma.aiBreedPrediction.create({
    data: {
      petId: petId ?? null,
      imageUrl,
      predictedBreed: prediction.predictedBreed,
      confidenceScore: prediction.confidence,
      alternatives: JSON.stringify(prediction.alternatives),
      modelVersion: prediction.modelVersion,
    },
  });
  return { id: record.id, imageUrl, ...prediction, processingMs: Date.now() - started };
}

/** Owner confirms or corrects the suggestion — feeds the T.5 confirmation-rate metric. */
export async function confirmBreed(user: SessionUser, id: string, body: { confirmed: boolean; finalBreed?: string | null; petId?: string }) {
  const prediction = await prisma.aiBreedPrediction.findUnique({ where: { id }, include: { pet: { select: { id: true, ownerId: true } } } });
  if (!prediction) throw notFound("Prediction");
  if (prediction.pet && prediction.pet.ownerId !== user.id && user.role !== "ADMIN") throw forbidden();
  const petId = body.petId ?? prediction.petId;
  if (petId) await assertOwnPet(user, petId);
  const finalBreed = body.confirmed ? prediction.predictedBreed : body.finalBreed!;
  return prisma.$transaction(async (tx) => {
    const p = await tx.aiBreedPrediction.update({ where: { id }, data: { ownerConfirmed: body.confirmed, finalBreed, petId: petId ?? null } });
    if (petId) await tx.pet.update({ where: { id: petId }, data: { breed: finalBreed } });
    return p;
  });
}

/** Chatbot turn: safety rules first, PII scrubbed before logging. */
export async function chat(user: SessionUser | null, message: string, locale?: Locale, sessionKey?: string) {
  const started = performance.now();
  const answer = reply(message, locale ?? user?.locale);
  const responseMs = Math.max(1, Math.round(performance.now() - started));
  const key = sessionKey ?? randomBytes(12).toString("base64url");
  const log = await prisma.chatbotLog.create({
    data: { userId: user?.id ?? null, sessionKey: key, locale: answer.locale, question: scrubPii(message), intent: answer.intent, answer: answer.answer, safetyEscalated: answer.safetyEscalated, responseMs },
  });
  return { id: log.id, sessionKey: key, ...answer, responseMs, engine: CHATBOT_VERSION };
}

export async function rateAnswer(user: SessionUser | null, id: string, helpful: boolean, sessionKey?: string) {
  const log = await prisma.chatbotLog.findUnique({ where: { id } });
  if (!log) throw notFound("Chat message");
  const owns = (user && log.userId === user.id) || (sessionKey && sessionKey === log.sessionKey);
  if (!owns) throw forbidden("You can only rate your own conversation");
  const updated = await prisma.chatbotLog.update({ where: { id }, data: { helpful } });
  return { id: updated.id, helpful: updated.helpful };
}
