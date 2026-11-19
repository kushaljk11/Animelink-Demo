// Outbound SMS / Viber / WhatsApp dispatch with environment-based adapters.
//  - development (default): pretty-prints each message to the console with a Nepal timestamp
//  - test: records to an in-memory outbox (assertions), prints nothing
//  - production (NOTIFY_MODE=live): SMS via Sparrow SMS or Aakash SMS; Viber/WhatsApp via a webhook bridge
// Dispatch never throws: a failed SMS must not fail the request that triggered it.
import { createHmac } from "node:crypto";

export type Channel = "sms" | "viber" | "whatsapp";
export type OutboundMessage = { channel: Channel; to: string; text: string; tag: string };
export type DispatchResult = { ok: boolean; provider: string; error?: string };

const env = () => ({
  mode: process.env.NOTIFY_MODE ?? (process.env.NODE_ENV === "test" ? "test" : process.env.NODE_ENV === "production" ? "live" : "console"),
  smsProvider: (process.env.SMS_PROVIDER ?? "sparrow").toLowerCase(),
  sparrowToken: process.env.SPARROW_SMS_TOKEN,
  sparrowFrom: process.env.SPARROW_SMS_FROM ?? "InfoSMS",
  aakashToken: process.env.AAKASH_SMS_TOKEN,
  chatWebhookUrl: process.env.CHAT_WEBHOOK_URL,
  chatWebhookSecret: process.env.CHAT_WEBHOOK_SECRET,
});

/** Messages captured in test mode (and the last 50 in console mode, for debugging). */
export const outbox: (OutboundMessage & { at: Date })[] = [];

/** 98XXXXXXXX → the 10-digit local form the Nepali gateways expect. */
export function localMobile(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^977/, "");
  return /^9[78]\d{8}$/.test(digits) ? digits : null;
}

const nptStamp = (d = new Date()) => `${new Date(d.getTime() + 345 * 60_000).toISOString().replace("T", " ").slice(0, 19)} NPT`;
const mask = (n: string) => `${n.slice(0, 3)}****${n.slice(-3)}`;

// ------------------------------------------------------------- adapters

async function sparrow(to: string, text: string): Promise<DispatchResult> {
  const { sparrowToken, sparrowFrom } = env();
  if (!sparrowToken) return { ok: false, provider: "sparrow", error: "SPARROW_SMS_TOKEN not set" };
  // Sparrow SMS v2: form-encoded token/from/to/text; `to` may be comma-separated.
  const r = await fetch("https://api.sparrowsms.com/v2/sms/", {
    method: "POST",
    body: new URLSearchParams({ token: sparrowToken, from: sparrowFrom, to, text }),
    signal: AbortSignal.timeout(10_000),
  });
  return r.ok ? { ok: true, provider: "sparrow" } : { ok: false, provider: "sparrow", error: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
}

async function aakash(to: string, text: string): Promise<DispatchResult> {
  const { aakashToken } = env();
  if (!aakashToken) return { ok: false, provider: "aakash", error: "AAKASH_SMS_TOKEN not set" };
  // Aakash SMS v3: form-encoded auth_token/to/text.
  const r = await fetch("https://sms.aakashsms.com/sms/v3/send", {
    method: "POST",
    body: new URLSearchParams({ auth_token: aakashToken, to, text }),
    signal: AbortSignal.timeout(10_000),
  });
  return r.ok ? { ok: true, provider: "aakash" } : { ok: false, provider: "aakash", error: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
}

/** Viber / WhatsApp go through a webhook (e.g. a Viber bot or WhatsApp Cloud API bridge), HMAC-signed. */
async function chatWebhook(msg: OutboundMessage): Promise<DispatchResult> {
  const { chatWebhookUrl, chatWebhookSecret } = env();
  if (!chatWebhookUrl) return { ok: false, provider: "webhook", error: "CHAT_WEBHOOK_URL not set" };
  const body = JSON.stringify({ channel: msg.channel, to: `+977${msg.to}`, text: msg.text, tag: msg.tag, sentAt: new Date().toISOString() });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (chatWebhookSecret) headers["x-rtn-signature"] = createHmac("sha256", chatWebhookSecret).update(body).digest("hex");
  const r = await fetch(chatWebhookUrl, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
  return r.ok ? { ok: true, provider: `webhook:${msg.channel}` } : { ok: false, provider: `webhook:${msg.channel}`, error: `HTTP ${r.status}` };
}

// ------------------------------------------------------------- dispatch

export async function dispatch(input: { channel?: Channel; to: string; text: string; tag: string }): Promise<DispatchResult> {
  const to = localMobile(input.to);
  if (!to) return { ok: false, provider: "none", error: "Not a Nepali mobile number" };
  const msg: OutboundMessage = { channel: input.channel ?? "sms", to, text: input.text.trim(), tag: input.tag };
  const { mode, smsProvider } = env();

  if (mode === "test" || mode === "console") {
    outbox.push({ ...msg, at: new Date() });
    if (outbox.length > 200) outbox.splice(0, outbox.length - 50);
    if (mode === "console") {
      // eslint-disable-next-line no-console
      console.log(`\n┌─ [${nptStamp()}] ${msg.channel.toUpperCase()} → ${msg.to} (${msg.tag})\n│ ${msg.text.replace(/\n/g, "\n│ ")}\n└─ ${msg.text.length} chars · NOTIFY_MODE=console (not sent)\n`);
    }
    return { ok: true, provider: mode };
  }

  try {
    const res = msg.channel === "sms" ? (smsProvider === "aakash" ? await aakash(to, msg.text) : await sparrow(to, msg.text)) : await chatWebhook(msg);
    if (!res.ok) console.warn(`[notify] ${msg.tag} → ${mask(to)} failed via ${res.provider}: ${res.error}`);
    return res;
  } catch (err) {
    console.warn(`[notify] ${msg.tag} → ${mask(to)} error: ${(err as Error).message}`);
    return { ok: false, provider: smsProvider, error: (err as Error).message };
  }
}

/** SMS-sized helper with the product prefix. */
export function sms(to: string, tag: string, text: string) {
  return dispatch({ channel: "sms", to, tag, text: `Rabies Track Nepal: ${text}` });
}
