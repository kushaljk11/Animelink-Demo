"use client";

import { ArrowLeft, ArrowUp, MessageSquare, PawPrint, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Avatar, EmptyState, Field, Input, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { api, errorMessage, type Paginated } from "@/lib/api";
import { useSession } from "@/lib/client/session";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

type ConversationRow = {
  id: string;
  subject: string | null;
  updatedAt: string;
  owner: { id: string; fullName: string };
  clinic: { id: string; clinicName: string; userId: string };
  pet: { id: string; name: string; photoUrl: string | null } | null;
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
};
type Thread = {
  conversation: { id: string; subject: string | null; ownerId: string; owner: { id: string; fullName: string }; clinic: { id: string; clinicName: string; userId: string }; pet: { id: string; name: string } | null };
  messages: { id: string; body: string; createdAt: string; readAt: string | null; sender: { id: string; fullName: string; role: string } }[];
};

// ------------------------------------------------------------------ new chat

export function NewConversationDialog({ open, onOpenChange, clinicId, petId }: { open: boolean; onOpenChange: (o: boolean) => void; clinicId?: string; petId?: string }) {
  const router = useRouter();
  const { data: clinics } = useSWR<Paginated<{ id: string; clinicName: string; address: string; openingHours: string | null }>>(open ? "/clinics?limit=100&sort=clinicName&order=asc" : null);
  const { data: pets } = useSWR<Paginated<{ id: string; name: string }>>(open ? "/pets?limit=100&sort=name&order=asc" : null);
  const [f, setF] = useState({ clinicId: clinicId ?? "", petId: petId ?? "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (open) setF({ clinicId: clinicId ?? "", petId: petId ?? "", subject: "", message: "" });
  }, [open, clinicId, petId]);
  const clinic = clinics?.data.find((c) => c.id === f.clinicId);

  const send = async () => {
    setSending(true);
    try {
      const r = await api<{ conversation: { id: string } }>("/conversations", {
        method: "POST",
        body: { clinicId: f.clinicId, petId: f.petId || null, subject: f.subject || null, message: f.message },
      });
      toast.success(`Message sent to ${clinic?.clinicName ?? "the clinic"}`);
      onOpenChange(false);
      router.push(`/app/chat/${r.conversation.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Message a vet clinic"
        description="For questions about vaccinations, appointments or your pet's care. In an emergency, call the clinic or go there directly."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void send()} loading={sending} disabled={!f.clinicId || f.message.trim().length < 1}>Send message</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Clinic" required hint={clinic ? `${clinic.address}${clinic.openingHours ? ` · ${clinic.openingHours}` : ""}` : "Only verified clinics are listed"}>
            <Select value={f.clinicId} onChange={(e) => setF({ ...f, clinicId: e.target.value })}>
              <option value="">Choose a clinic…</option>
              {clinics?.data.map((c) => <option key={c.id} value={c.id}>{c.clinicName}</option>)}
            </Select>
          </Field>
          <Field label="About which pet?">
            <Select value={f.petId} onChange={(e) => setF({ ...f, petId: e.target.value })}>
              <option value="">General question</option>
              {pets?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Subject">
            <Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="e.g. Booster appointment" maxLength={120} />
          </Field>
          <Field label="Message" required>
            <Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Hi doctor, …" maxLength={2000} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------------- inbox

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const session = useSession();
  const { data, error, mutate } = useSWR<Thread>(`/conversations/${id}/messages?limit=200`, { refreshInterval: 5000 });
  const { mutate: globalMutate } = useSWRConfig();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);
  // Opening a thread marks it read server-side: refresh the inbox list and the sidebar badge.
  const loaded = !!data;
  useEffect(() => {
    if (loaded) {
      void globalMutate("/conversations?limit=100");
      void globalMutate("/nav-counts");
    }
  }, [loaded, id, globalMutate]);
  const refreshList = () => globalMutate("/conversations?limit=100");

  if (error) return <EmptyState icon={<MessageSquare />} title="Conversation not available" description={errorMessage(error)} />;
  if (!data) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-1/2" /><Skeleton className="ml-auto h-10 w-1/2" /><Skeleton className="h-10 w-2/3" /></div>;

  const c = data.conversation;
  const iAmOwner = c.ownerId === session.id;
  const other = iAmOwner ? c.clinic.clinicName : c.owner.fullName;
  const canSend = c.ownerId === session.id || c.clinic.userId === session.id;

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      await api(`/conversations/${id}/messages`, { method: "POST", body: { body: text } });
      setBody("");
      await mutate();
      void refreshList();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft /></Button>
        <Avatar name={other} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{other}</p>
          <p className="truncate text-xs text-muted">
            {c.subject ?? "Conversation"}
            {c.pet && (
              <>
                {" · "}
                <Link href={`/app/pets/${c.pet.id}`} className="inline-flex items-center gap-1 text-accent hover:underline"><PawPrint className="size-3" />{c.pet.name}</Link>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4">
        {data.messages.map((m) => {
          const mine = m.sender.id === session.id;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[78%] rounded-2xl px-4 py-2.5 text-sm", mine ? "rounded-br-md bg-primary text-primary-fg" : "rounded-bl-md border border-border bg-surface-2 text-fg")}>
                <p className="whitespace-pre-line leading-relaxed">{m.body}</p>
                <p className={cn("mt-1 text-[10px]", mine ? "text-primary-fg/70" : "text-muted")} title={formatDateTime(m.createdAt)}>
                  {mine ? "You" : m.sender.fullName} · {timeAgo(m.createdAt)}
                  {mine && m.readAt ? " · Seen" : ""}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {canSend ? (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2 border-t border-border p-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`Message ${other}… (Enter to send, Shift+Enter for a new line)`}
            rows={1}
            className="min-h-11 flex-1 resize-none"
            maxLength={2000}
          />
          <Button type="submit" variant="primary" size="icon" loading={sending} disabled={!body.trim()} aria-label="Send"><ArrowUp /></Button>
        </form>
      ) : (
        <p className="border-t border-border p-3 text-center text-xs text-muted">Read-only: administrators can view but not reply.</p>
      )}
    </div>
  );
}

export function Messages({ activeId }: { activeId?: string }) {
  const session = useSession();
  const router = useRouter();
  const { data } = useSWR<Paginated<ConversationRow>>("/conversations?limit=100", { refreshInterval: 15000 });
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const owner = session.role === "PET_OWNER";
  const rows = (data?.data ?? []).filter((c) => {
    if (!q) return true;
    const hay = `${c.clinic.clinicName} ${c.owner.fullName} ${c.pet?.name ?? ""} ${c.subject ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0">
      <aside className={cn("flex w-full min-w-0 flex-col border-r border-border bg-surface md:w-80 md:shrink-0", activeId && "hidden md:flex")}>
        <div className="space-y-3 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-fg">{owner ? "Messages with vets" : "Messages from owners"}</h1>
            {owner && <Button size="sm" variant="primary" onClick={() => setNewOpen(true)}><Plus /> New</Button>}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="h-8 pl-8" />
          </div>
        </div>
        <ul className="scroll-thin flex-1 overflow-y-auto">
          {!data && Array.from({ length: 5 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-12 w-full" /></li>)}
          {data && rows.length === 0 && (
            <li>
              <EmptyState
                icon={<MessageSquare />}
                title={q ? "No matching conversations" : "No conversations yet"}
                description={owner ? "Ask a verified clinic about vaccinations, appointments or your pet's care." : "When pet owners message your clinic, they'll appear here."}
                action={owner && !q ? <Button size="sm" variant="primary" onClick={() => setNewOpen(true)}><Plus /> Message a vet</Button> : undefined}
              />
            </li>
          )}
          {rows.map((c) => {
            const title = owner ? c.clinic.clinicName : c.owner.fullName;
            return (
              <li key={c.id}>
                <button
                  onClick={() => router.push(`/app/chat/${c.id}`)}
                  className={cn("flex w-full gap-3 border-b border-border px-3 py-3 text-left transition hover:bg-surface-2", activeId === c.id && "bg-surface-3")}
                >
                  <Avatar name={title} src={c.pet?.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn("flex-1 truncate text-sm", c.unreadCount ? "font-semibold text-fg" : "text-fg-soft")}>{title}</span>
                      <span className="shrink-0 text-[11px] text-muted">{timeAgo(c.lastMessage?.createdAt ?? c.updatedAt)}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">{[c.pet?.name, c.subject].filter(Boolean).join(" · ") || "General"}</span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="flex-1 truncate text-xs text-fg-soft">{c.lastMessage ? `${c.lastMessage.senderId === session.id ? "You: " : ""}${c.lastMessage.body}` : ""}</span>
                      {c.unreadCount > 0 && <span className="rounded-full bg-info px-1.5 text-[10px] font-semibold text-white">{c.unreadCount}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <section className={cn("min-w-0 flex-1 bg-bg", !activeId && "hidden md:block")}>
        {activeId ? (
          <ThreadView key={activeId} id={activeId} onBack={() => router.push("/app/chat")} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={<MessageSquare />} title="Select a conversation" description={owner ? "Or start a new one with a verified clinic." : "Choose an owner on the left to read and reply."} />
          </div>
        )}
      </section>
      {owner && <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} />}
    </div>
  );
}
