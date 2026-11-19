import { randomBytes } from "node:crypto";
import QRCode from "qrcode";

/** 128-bit unguessable token — the QR code is the only key to a pet's public profile. */
export function newQrToken(): string {
  return randomBytes(16).toString("base64url");
}

export const publicPetPath = (qrToken: string) => `/p/${qrToken}`;

export function qrPng(text: string, size = 512): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", width: size, margin: 2, errorCorrectionLevel: "M" });
}

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
}
