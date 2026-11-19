"use client";

import { Check, LocateFixed, Loader2 } from "lucide-react";
import { forwardRef, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { errorMessage, qs } from "@/lib/api";
import { currentPosition, lookupPlace, reverseGeocode, type Place, type PlaceSuggestion } from "@/lib/places";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "list"> & {
  /** Show a "Detect" button (GPS → municipality). Receives the full place so callers can fill ward/address too. */
  onDetected?: (place: Place) => void;
};

/** Sets an input's value the way a user would, so react-hook-form `register` and controlled inputs both see it. */
function setNativeValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Free-text municipality with suggestions from municipalities already in the system, an OpenStreetMap
 * check when the field loses focus (expands "pokhara" → "Pokhara Metropolitan City"), and optional GPS detection.
 * Works with react-hook-form `register(...)` or as a controlled input.
 */
export const MunicipalityInput = forwardRef<HTMLInputElement, Props>(function MunicipalityInput({ onDetected, className, onBlur, onChange, placeholder, ...props }, ref) {
  const listId = useId();
  const inner = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState(String(props.value ?? props.defaultValue ?? ""));
  const [status, setStatus] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const { data } = useSWR<{ data: PlaceSuggestion[] }>(`/geo/places${qs({ q: q.trim() })}`, { keepPreviousData: true, revalidateOnFocus: false });
  const known = data?.data ?? [];

  const setRefs = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const check = async (value: string) => {
    const v = value.trim();
    if (v.length < 3 || known.some((k) => k.name.toLowerCase() === v.toLowerCase())) return setStatus(null);
    setChecking(true);
    try {
      const [hit] = await lookupPlace(v);
      if (!hit) return setStatus({ tone: "warn", text: "Not found on the map. Check the spelling (it can still be saved)." });
      if (hit.name !== v && inner.current) setNativeValue(inner.current, hit.name);
      setStatus({ tone: "ok", text: `${hit.name}${hit.detail ? ` · ${hit.detail}` : ""}` });
    } catch {
      setStatus(null); // offline: accept what was typed
    } finally {
      setChecking(false);
    }
  };

  const detect = async () => {
    setDetecting(true);
    try {
      const { p } = await currentPosition();
      const place = await reverseGeocode(p);
      if (!place.municipality) return toast.error("Couldn't work out the municipality here. Please type it.");
      if (inner.current) setNativeValue(inner.current, place.municipality);
      setStatus({ tone: "ok", text: place.label });
      onDetected?.(place);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            {...props}
            ref={setRefs}
            list={listId}
            autoComplete="off"
            placeholder={placeholder ?? "Start typing, e.g. Kathmandu"}
            className={cn(checking && "pr-8", className)}
            onChange={(e) => {
              setQ(e.target.value);
              setStatus(null);
              onChange?.(e);
            }}
            onBlur={(e) => {
              onBlur?.(e);
              void check(e.target.value);
            }}
          />
          {checking && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />}
          <datalist id={listId}>
            {known.map((k) => (
              <option key={k.name} value={k.name}>{k.detail ?? ""}</option>
            ))}
          </datalist>
        </div>
        {onDetected && (
          <Button type="button" variant="secondary" onClick={() => void detect()} loading={detecting} title="Detect from my location">
            <LocateFixed /> <span className="hidden sm:inline">Detect</span>
          </Button>
        )}
      </div>
      {status && (
        <p className={cn("flex items-center gap-1 text-[11px]", status.tone === "ok" ? "text-success" : "text-warning")}>
          {status.tone === "ok" && <Check className="size-3" />} {status.text}
        </p>
      )}
    </div>
  );
});
