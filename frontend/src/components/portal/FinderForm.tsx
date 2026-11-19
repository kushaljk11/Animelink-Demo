"use client";

import { Check, LocateFixed, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";

/** "I found this pet": optional location share + message, notifying the owner (Section N.2). */
export function FinderForm({ token, petName, lost }: { token: string; petName: string; lost: boolean }) {
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [share, setShare] = useState(lost);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const getLocation = () =>
    new Promise<{ lat: number; lng: number }>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Location is not available on this device"));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => reject(new Error("Location permission was denied")),
        { enableHighAccuracy: true, timeout: 12_000 },
      );
    });

  const send = async () => {
    setBusy(true);
    try {
      let loc = coords;
      if (share && !loc) {
        loc = await getLocation();
        setCoords(loc);
      }
      const r = await api<{ message: string }>(`/public/pets/${token}/scan`, {
        method: "POST",
        body: { shareLocation: share && !!loc, latitude: loc?.lat, longitude: loc?.lng, message: message || null, contact: contact || null },
      });
      setDone(r.message);
      toast.success(r.message);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <span className="flex size-9 items-center justify-center rounded-full bg-success/15 text-success"><Check className="size-5" /></span>
        <p className="text-sm text-fg">{done}</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <p className="text-sm font-semibold text-fg">{lost ? `Found ${petName}?` : `Message ${petName}'s owner`}</p>
        <p className="text-xs text-muted">The owner is notified instantly. Sharing your location is optional and only goes to the owner.</p>
      </div>
      <Field label="Message"><Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`e.g. ${petName} is safe with us near the bus stop`} maxLength={500} className="min-h-20" /></Field>
      <Field label="Your phone (optional)"><Input type="tel" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={80} placeholder="98XXXXXXXX" /></Field>
      <label className="flex items-center gap-2 text-sm text-fg-soft">
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
        <LocateFixed className="size-4 text-muted" /> Share my current location with the owner
        {coords && <span className="text-xs text-success">· captured</span>}
      </label>
      <Button variant={lost ? "danger" : "primary"} className="w-full" onClick={() => void send()} loading={busy}>
        <Send /> Notify owner
      </Button>
    </Card>
  );
}
