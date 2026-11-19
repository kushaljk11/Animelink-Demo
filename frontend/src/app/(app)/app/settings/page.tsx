"use client";

import { BadgeCheck, Ban, Clock, KeyRound, Save, ShieldAlert, UserRound, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { MunicipalityInput } from "@/components/forms/MunicipalityInput";
import { LocationPicker } from "@/components/maps/LocationPicker";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/client/session";
import { ROLE_LABEL } from "@/lib/constants";
import type { LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";

type Org = {
  id: string;
  clinicName?: string;
  organizationName?: string;
  registrationNumber?: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  wardNumber: number | null;
  municipality: string | null;
  openingHours?: string | null;
  hasShelter?: boolean;
  serviceRadiusKm: number;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
};
type Me = {
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    role: keyof typeof ROLE_LABEL;
    municipality: string | null;
    wardNumber: number | null;
    locale: "EN" | "NE";
    veterinaryClinic: Org | null;
    rescueOrganization: Org | null;
  };
};

const PHONE = /^(\+?977[-\s]?)?(9[678]\d{8}|0\d{1,2}-?\d{6,7})$/;

function StatusBanner({ status, kind }: { status: Org["verificationStatus"]; kind: "clinic" | "organisation" }) {
  const unlock = kind === "clinic" ? "record and verify vaccinations" : "record CNVR activity";
  const meta: Record<Org["verificationStatus"], { icon: ReactNode; tone: string; title: string; body: string }> = {
    VERIFIED: { icon: <BadgeCheck />, tone: "border-success/30 bg-success/10 text-success", title: `Your ${kind} is verified`, body: `You can ${unlock}. Your listing appears in the public “nearby” search.` },
    PENDING: { icon: <Clock />, tone: "border-warning/30 bg-warning/10 text-warning", title: "Waiting for verification", body: `An administrator is reviewing your ${kind}. Until then you can explore, but you can't ${unlock}. Check the details below are correct — you'll get a notification when it's reviewed.` },
    REJECTED: { icon: <XCircle />, tone: "border-danger/30 bg-danger/10 text-danger", title: "Verification was not approved", body: "Check your notifications for the reason, correct the details below and contact the ward office to request another review." },
    SUSPENDED: { icon: <Ban />, tone: "border-danger/30 bg-danger/10 text-danger", title: "Your listing is suspended", body: `You can't ${unlock} and you're hidden from public search. Contact the ward office for details.` },
  };
  const m = meta[status];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4 [&_svg]:size-5 [&_svg]:shrink-0", m.tone)}>
      {m.icon}
      <div>
        <p className="text-sm font-semibold">{m.title}</p>
        <p className="mt-0.5 text-sm text-fg-soft">{m.body}</p>
      </div>
    </div>
  );
}

function ProfileCard({ me, onSaved }: { me: Me["user"]; onSaved: () => void }) {
  const [f, setF] = useState({ fullName: me.fullName, phone: me.phone ?? "", municipality: me.municipality ?? "", wardNumber: me.wardNumber ? String(me.wardNumber) : "", locale: me.locale });
  const [saving, setSaving] = useState(false);
  const phoneError = f.phone && !PHONE.test(f.phone) ? "Enter a valid Nepali mobile or landline number" : undefined;
  const wardError = f.wardNumber && (Number(f.wardNumber) < 1 || Number(f.wardNumber) > 35) ? "Ward must be 1–35" : undefined;
  const save = async () => {
    if (phoneError || wardError || f.fullName.trim().length < 2) return toast.error("Please fix the highlighted fields");
    setSaving(true);
    try {
      await api("/auth/me", {
        method: "PATCH",
        body: { fullName: f.fullName.trim(), phone: f.phone || null, municipality: f.municipality || null, wardNumber: f.wardNumber ? Number(f.wardNumber) : null, locale: f.locale },
      });
      toast.success("Profile saved");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><UserRound className="size-4 text-muted" /> Your profile</span>} description={`${me.email} · ${ROLE_LABEL[me.role]}`} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Full name" required error={f.fullName.trim().length < 2 ? "Enter your name" : undefined}>
          <Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        </Field>
        <Field label="Mobile number" error={phoneError} hint={me.role === "PET_OWNER" ? "Shown to finders only while a pet is marked lost" : undefined}>
          <Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="98XXXXXXXX" />
        </Field>
        <Field label="Municipality">
          <MunicipalityInput
            value={f.municipality}
            onChange={(e) => setF((s) => ({ ...s, municipality: e.target.value }))}
            onDetected={(p) => setF((s) => ({ ...s, municipality: p.municipality ?? s.municipality, wardNumber: p.wardNumber ? String(p.wardNumber) : s.wardNumber }))}
          />
        </Field>
        <Field label="Ward" error={wardError}>
          <Input type="number" min={1} max={35} value={f.wardNumber} onChange={(e) => setF({ ...f, wardNumber: e.target.value })} />
        </Field>
        <Field label="Language" hint="Used by the assistant and for reminders">
          <Select value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value as "EN" | "NE" })}>
            <option value="EN">English</option>
            <option value="NE">नेपाली (Nepali)</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button variant="primary" onClick={() => void save()} loading={saving}><Save /> Save profile</Button>
      </div>
    </Card>
  );
}

function PasswordCard() {
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const weak = f.next && !(f.next.length >= 8 && /[a-z]/.test(f.next) && /[A-Z]/.test(f.next) && /\d/.test(f.next));
  const mismatch = f.confirm && f.next !== f.confirm;
  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ message: string }>("/auth/password", { method: "POST", body: { currentPassword: f.current, newPassword: f.next } });
      toast.success(r.message);
      setF({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><KeyRound className="size-4 text-muted" /> Password</span>} description="Changing it signs you out on other devices." />
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        </Field>
        <Field label="New password" error={weak ? "8+ characters with upper, lower case and a number" : undefined}>
          <Input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </Field>
        <Field label="Confirm new password" error={mismatch ? "Passwords don't match" : undefined}>
          <Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button variant="secondary" onClick={() => void save()} loading={saving} disabled={!f.current || !f.next || !!weak || !!mismatch || !f.confirm}>
          Change password
        </Button>
      </div>
    </Card>
  );
}

function OrganisationCard({ kind, org, onSaved }: { kind: "clinic" | "organisation"; org: Org; onSaved: () => void }) {
  const [f, setF] = useState({
    name: org.clinicName ?? org.organizationName ?? "",
    registrationNumber: org.registrationNumber ?? "",
    phone: org.phone,
    address: org.address,
    municipality: org.municipality ?? "",
    wardNumber: org.wardNumber ? String(org.wardNumber) : "",
    openingHours: org.openingHours ?? "",
    hasShelter: org.hasShelter ?? true,
    serviceRadiusKm: String(org.serviceRadiusKm),
  });
  const [loc, setLoc] = useState<LatLng>({ lat: org.latitude, lng: org.longitude });
  const [saving, setSaving] = useState(false);
  const regChanged = kind === "clinic" && f.registrationNumber !== (org.registrationNumber ?? "");
  const save = async () => {
    if (!PHONE.test(f.phone)) return toast.error("Enter a valid contact number");
    setSaving(true);
    try {
      const common = {
        phone: f.phone,
        address: f.address,
        latitude: loc.lat,
        longitude: loc.lng,
        municipality: f.municipality || undefined,
        wardNumber: f.wardNumber ? Number(f.wardNumber) : undefined,
        serviceRadiusKm: Number(f.serviceRadiusKm) || undefined,
      };
      await api(kind === "clinic" ? `/clinics/${org.id}` : `/organizations/${org.id}`, {
        method: "PUT",
        body: kind === "clinic" ? { ...common, clinicName: f.name, registrationNumber: f.registrationNumber, openingHours: f.openingHours || null } : { ...common, organizationName: f.name, hasShelter: f.hasShelter },
      });
      toast.success(regChanged ? "Saved — the new registration number will be re-verified" : "Details saved");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader title={kind === "clinic" ? "Clinic profile" : "Organisation profile"} description="This is what the public sees in the nearby search and on certificates." />
      <div className="space-y-5 p-5">
        <StatusBanner status={org.verificationStatus} kind={kind} />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <Field label={kind === "clinic" ? "Clinic name" : "Organisation name"} className="sm:col-span-2">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            {kind === "clinic" && (
              <Field label="Registration number" className="sm:col-span-2" hint={regChanged ? "Changing this sends your clinic back for verification" : undefined}>
                <Input value={f.registrationNumber} onChange={(e) => setF({ ...f, registrationNumber: e.target.value })} />
              </Field>
            )}
            <Field label="Contact number">
              <Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
            <Field label="Service radius (km)" hint="How far you usually serve">
              <Input type="number" min={0.5} max={50} step={0.5} value={f.serviceRadiusKm} onChange={(e) => setF({ ...f, serviceRadiusKm: e.target.value })} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </Field>
            <Field label="Municipality">
              <MunicipalityInput value={f.municipality} onChange={(e) => setF((s) => ({ ...s, municipality: e.target.value }))} />
            </Field>
            <Field label="Ward">
              <Input type="number" min={1} max={35} value={f.wardNumber} onChange={(e) => setF({ ...f, wardNumber: e.target.value })} />
            </Field>
            {kind === "clinic" ? (
              <Field label="Opening hours" className="sm:col-span-2">
                <Input value={f.openingHours} onChange={(e) => setF({ ...f, openingHours: e.target.value })} placeholder="Sun–Fri 9:00–18:00" />
              </Field>
            ) : (
              <label className="flex items-center gap-2 text-sm text-fg-soft sm:col-span-2">
                <input type="checkbox" checked={f.hasShelter} onChange={(e) => setF({ ...f, hasShelter: e.target.checked })} /> We run a shelter facility
              </label>
            )}
          </div>
          <Field label="Location">
            <LocationPicker
              value={loc}
              onChange={(p) => setLoc(p)}
              onPlace={(place) =>
                setF((s) => ({
                  ...s,
                  municipality: place.municipality ?? s.municipality,
                  wardNumber: place.wardNumber ? String(place.wardNumber) : s.wardNumber,
                  address: s.address || place.address || s.address,
                }))
              }
            />
          </Field>
        </div>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button variant="primary" onClick={() => void save()} loading={saving}><Save /> Save {kind}</Button>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const session = useSession();
  const router = useRouter();
  const { data, mutate } = useSWR<Me>("/auth/me");
  const [hash, setHash] = useState("");
  useEffect(() => {
    setHash(window.location.hash);
  }, []);
  useEffect(() => {
    if (data && hash) document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
  }, [data, hash]);
  const refresh = () => {
    void mutate();
    router.refresh(); // re-runs the server layout so the header/sidebar session updates too
  };
  const org = data?.user.veterinaryClinic ?? data?.user.rescueOrganization ?? null;
  const kind = data?.user.veterinaryClinic ? "clinic" : "organisation";

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <PageHeader title="Settings" description="Your account, password and — for clinics and rescue organisations — your public profile." />
      {!data ? (
        <div className="space-y-4"><Skeleton className="h-56 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : (
        <>
          {org && (
            <div id="organisation">
              <OrganisationCard key={org.id + org.verificationStatus} kind={kind} org={org} onSaved={refresh} />
            </div>
          )}
          {!org && (session.role === "VET_CLINIC" || session.role === "RESCUE_ORG") && (
            <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-fg">
              <ShieldAlert className="size-5 shrink-0 text-warning" />
              No {session.role === "VET_CLINIC" ? "clinic" : "organisation"} profile is linked to this account. Please contact an administrator.
            </div>
          )}
          <ProfileCard key={data.user.id + data.user.fullName} me={data.user} onSaved={refresh} />
          <PasswordCard />
        </>
      )}
    </div>
  );
}
