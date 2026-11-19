"use client";

import { ArrowUp, Bot, ShieldAlert, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type Reply = { id: string; sessionKey: string; intent: string; answer: string; safetyEscalated: boolean; suggestions: string[]; links: { label: string; href: string }[]; locale: "EN" | "NE"; responseMs: number };
type Msg = { role: "user"; text: string } | { role: "bot"; reply: Reply; rated?: boolean };

const STARTERS = ["How do I register my pet?", "When is the rabies booster due?", "A dog bit me — what should I do?", "How do QR tags work?", "मेरो कुकुर हरायो", "Find a vet near me"];

/** Offline guidance chatbot UI (Section T.2). Never diagnoses — escalations are highlighted. */
export function Assistant({ compact }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionKey = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);

  // Block body: newer browsers return a Promise from scrollIntoView, which React rejects as an effect cleanup.
  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setBusy(true);
    try {
      const r = await api<Reply>("/ai/chat", { method: "POST", body: { message: msg, sessionKey: sessionKey.current } });
      sessionKey.current = r.sessionKey;
      setMessages((m) => [...m, { role: "bot", reply: r }]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const rate = async (idx: number, helpful: boolean) => {
    const m = messages[idx];
    if (!m || m.role !== "bot" || m.rated) return;
    try {
      await api(`/ai/chat/${m.reply.id}`, { method: "PATCH", body: { helpful, sessionKey: m.reply.sessionKey } });
      setMessages((all) => all.map((x, i) => (i === idx && x.role === "bot" ? { ...x, rated: true } : x)));
      toast.success("Thanks for the feedback");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card", compact ? "h-[440px] max-h-[75dvh]" : "h-[calc(100dvh-12rem)] min-h-[480px]")}>
      <div aria-live="polite" className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-lg py-2 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border bg-surface-2"><Bot className="size-6 text-fg-soft" /></span>
            <p className="mt-4 text-base font-semibold text-fg">Rabies Track assistant</p>
            <p className="mt-1 text-sm text-muted">Ask in English or नेपाली. I can explain features and give general guidance — I can&apos;t diagnose rabies or replace a doctor or vet.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {(compact ? STARTERS.slice(0, 3) : STARTERS).map((s) => (
                <button key={s} onClick={() => void send(s)} className="rounded-full border border-border bg-surface-2 px-3 py-2 text-sm text-fg-soft transition hover:border-success hover:text-fg">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-fg">{m.text}</p>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", m.reply.safetyEscalated ? "border-danger/30 bg-danger/10 text-danger" : "border-border bg-surface-2 text-fg-soft")}>
                {m.reply.safetyEscalated ? <ShieldAlert className="size-4" /> : <Bot className="size-4" />}
              </span>
              <div className="max-w-[85%] space-y-2">
                <div className={cn("whitespace-pre-line rounded-2xl rounded-tl-md border px-4 py-3 text-sm leading-relaxed", m.reply.safetyEscalated ? "border-danger/30 bg-danger/5 text-fg" : "border-border bg-surface-2 text-fg-soft")}>{m.reply.answer}</div>
                {(m.reply.links.length > 0 || m.reply.suggestions.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.reply.links.map((l) => (
                      <Link key={l.href} href={l.href} className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/15">{l.label} →</Link>
                    ))}
                    {m.reply.suggestions.map((s) => (
                      <button key={s} onClick={() => void send(s)} className="rounded-full border border-border px-3 py-1 text-xs text-fg-soft hover:border-border-strong">{s}</button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1 text-[11px] text-muted">
                  <span>{m.reply.safetyEscalated ? "Safety guidance" : m.reply.intent.replace(/_/g, " ")} · {m.reply.responseMs} ms</span>
                  {!m.rated ? (
                    <>
                      <button onClick={() => void rate(i, true)} className="ml-2 rounded p-1 hover:bg-surface-2 hover:text-success" aria-label="Helpful"><ThumbsUp className="size-3.5" /></button>
                      <button onClick={() => void rate(i, false)} className="rounded p-1 hover:bg-surface-2 hover:text-danger" aria-label="Not helpful"><ThumbsDown className="size-3.5" /></button>
                    </>
                  ) : (
                    <span className="ml-2">Rated — thank you</span>
                  )}
                </div>
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface-2"><Bot className="size-4 text-muted" /></span>
            <span className="flex items-center gap-1 rounded-2xl border border-border bg-surface-2 px-4 py-3">
              {[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d * 120}ms` }} />)}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2 border-t border-border p-3"
      >
        <Textarea
          aria-label="Message the assistant"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Ask about vaccinations, QR tags, lost pets, reporting bites… (Enter to send)"
          className="min-h-11 flex-1 resize-none"
          rows={1}
          maxLength={1000}
        />
        <Button type="submit" variant="primary" size="icon" disabled={!input.trim() || busy} aria-label="Send"><ArrowUp /></Button>
      </form>
      <p className="border-t border-border bg-surface-2 px-4 py-2 text-xs leading-relaxed text-fg-soft">General guidance only, not a diagnosis. For a bite or scratch, wash the wound for 15 minutes and visit a hospital today. Emergency: 102.</p>
    </div>
  );
}
