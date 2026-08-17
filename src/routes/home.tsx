import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  CloudSun,
  IndianRupee,
  Loader2,
  LogOut,
  Moon,
  Package,
  PackageCheck,
  Plus,
  ReceiptText,
  Send,
  Settings,
  Sun,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CameraCapture } from "@/components/CameraCapture";
import { InstallShortcut } from "@/components/InstallShortcut";
import { PaymentReceiptDialog } from "@/components/PaymentReceipt";
import { MockPaymentDialog } from "@/components/MockPaymentDialog";
import { getPharmacy } from "@/lib/portal-auth.functions";
import { getMe, restoreSession, signOut } from "@/lib/company-auth";
import {
  analyzePrescription,
  listPrescriptions,
  submitPrescription,
} from "@/lib/prescriptions.functions";
import { confirmPayment, startPayment } from "@/lib/payments.functions";
import {
  clearSession,
  errorMessage,
  fileToDataUrl,
  getPharmacyCode,
  getToken,
} from "@/lib/portal-client";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "My prescriptions — MedLink Pharmacy Portal" },
      {
        name: "description",
        content:
          "Upload a prescription PDF or photo, review the medicines we read from it, and send the order to your pharmacy.",
      },
      { property: "og:title", content: "My prescriptions — MedLink Pharmacy Portal" },
      {
        property: "og:description",
        content: "Upload, review and send prescriptions to your pharmacy from your phone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

// Mirrors ExtractedMedicine in prescriptions.server.ts — kept as a separate
// local type (rather than importing across the client/server boundary) the
// same way this file already does for the rest of the draft shape.
type Medicine = {
  name: string;
  strength: string | null;
  strengthUnit: string | null;
  frequency: string | null;
  /** Which of Morning/Afternoon/Night this dose applies to — display only,
   * derived deterministically server-side from the same shorthand frequency
   * itself comes from. Never "Evening". See ExtractedMedicine in
   * prescriptions.server.ts. */
  scheduleSlots: string[];
  timing: string | null;
  duration: string | null;
  durationUnit: string | null;
  quantity: string | null;
};

const BLANK_MEDICINE: Medicine = {
  name: "",
  strength: null,
  strengthUnit: null,
  frequency: null,
  scheduleSlots: [],
  timing: null,
  duration: null,
  durationUnit: null,
  quantity: null,
};

// "tabs" deliberately excluded — it's a dosage FORM (how many tablets),
// not a strength unit like the ones below; conflating the two caused Qwen
// to read "Tab. Dolo 650" as strengthUnit "tabs" instead of recognizing
// "Tab." as the form and "650" as the strength. See QWEN_SYSTEM_PROMPT in
// prescriptions.server.ts for the extraction-side half of this fix.
const STRENGTH_UNITS = ["mg", "ml", "g", "mcg", "IU", "drops", "puffs"] as const;

// Exactly three fixed time-of-day slots — deliberately no "Evening".
const SCHEDULE_SLOT_ICON: Record<string, typeof CloudSun> = {
  Morning: CloudSun,
  Afternoon: Sun,
  Night: Moon,
};

const TIMINGS = [
  "Before food",
  "After food",
  "With food",
  "Empty stomach",
  "Bedtime",
  "Anytime",
] as const;
const DURATION_UNITS = ["Days", "Weeks", "Months"] as const;

/** One medicine's fields in the "Confirm the medicines" screen — a compact,
 * labeled card (name, dosage+unit, schedule, food timing, duration+unit)
 * instead of the previous flat free-text row, so Qwen's normalized
 * extraction lands directly in matching controls. A single "Dosage | Unit"
 * row covers both a tablet's strength and a liquid's per-dose amount — that
 * distinction is handled internally by the extraction/normalization logic
 * in prescriptions.server.ts and intentionally doesn't surface as two
 * separate fields here. The Schedule block is a plain read-only summary in
 * an input-styled bordered row (frequency text, a dashed divider, then
 * Morning/Afternoon/Night icons from `scheduleSlots`) — visually consistent
 * with the other fields but deliberately not a dropdown/editable control,
 * per explicit request. `frequency` itself isn't directly editable from
 * this card;
 * "Food timing" (food/meal instruction — a separate concept from schedule)
 * is still an editable dropdown, unchanged mechanism, just relabeled. There
 * is no per-medicine notes field — only the single prescription-level
 * "Doctor's Advice" field below the medicines list (bound to `draft.notes`,
 * not part of `Medicine`). `quantity` stays on `Medicine` for
 * backend-payload compatibility (see send() in HomePage) but has no field
 * here — not part of this card. Local to this file; not a second/parallel
 * medicine form — it's the same single list in HomePage(), just factored
 * out of the .map() for readability. */
function MedicineCard({
  index,
  medicine,
  onChange,
  onRemove,
}: {
  index: number;
  medicine: Medicine;
  onChange: (patch: Partial<Medicine>) => void;
  onRemove: () => void;
}) {
  const fieldId = (field: string) => `medicine-${index}-${field}`;
  return (
    <li className="space-y-2 rounded-lg border border-border/60 bg-secondary/70 p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center">
        <p className="text-xs font-semibold text-muted-foreground">#{index + 1}</p>
        <button
          aria-label="Remove medicine"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="space-y-1">
        <Label htmlFor={fieldId("name")} className="text-xs">
          Medicine name
        </Label>
        <Input
          id={fieldId("name")}
          value={medicine.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Paracetamol"
          className="h-10 bg-card font-medium"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={fieldId("strength")} className="text-xs">
            Dosage
          </Label>
          <Input
            id={fieldId("strength")}
            value={medicine.strength ?? ""}
            onChange={(e) => onChange({ strength: e.target.value || null })}
            placeholder="e.g. 40"
            inputMode="decimal"
            className="h-10 bg-card text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Unit</Label>
          <Select
            value={medicine.strengthUnit ?? ""}
            onValueChange={(v) => onChange({ strengthUnit: v })}
          >
            <SelectTrigger aria-label="Dosage unit" className="h-10 bg-card text-sm">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {STRENGTH_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Schedule</Label>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-input bg-card px-3 py-2.5 text-sm">
          {medicine.frequency ? (
            <span className="font-normal text-foreground">{medicine.frequency}</span>
          ) : (
            <span className="text-muted-foreground">Not confidently read</span>
          )}
          {medicine.scheduleSlots.length ? (
            <>
              <span className="h-4 border-l border-dashed border-border" aria-hidden="true" />
              {medicine.scheduleSlots.map((slot) => {
                const SlotIcon = SCHEDULE_SLOT_ICON[slot];
                return (
                  <span key={slot} className="inline-flex items-center gap-1.5 text-foreground">
                    {SlotIcon ? <SlotIcon className="size-4 text-amber-500" /> : null}
                    {slot}
                  </span>
                );
              })}
            </>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Food timing</Label>
        <Select value={medicine.timing ?? ""} onValueChange={(v) => onChange({ timing: v })}>
          <SelectTrigger aria-label="Food timing" className="h-10 bg-card text-sm">
            <SelectValue placeholder="Select timing" />
          </SelectTrigger>
          <SelectContent>
            {TIMINGS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={fieldId("duration")} className="text-xs">
            Duration
          </Label>
          <Input
            id={fieldId("duration")}
            value={medicine.duration ?? ""}
            onChange={(e) => onChange({ duration: e.target.value || null })}
            placeholder="e.g. 5"
            inputMode="numeric"
            className="h-10 bg-card text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Unit</Label>
          <Select
            value={medicine.durationUnit ?? ""}
            onValueChange={(v) => onChange({ durationUnit: v })}
          >
            <SelectTrigger aria-label="Duration unit" className="h-10 bg-card text-sm">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {DURATION_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </li>
  );
}

/** Fulfillment tracking stages shown on each "Recent orders" card, separate
 * from payment status — an order can be paid but still "booked", or still
 * awaiting payment while already "shipped". Only rendered when rx.status is
 * one of these four; any other status (e.g. providerService's real "sent"/
 * "quoted") falls back to the plain text badge instead — see OrderTracker. */
const ORDER_STAGES = [
  { key: "booked", label: "Booked", icon: Package },
  { key: "dispatched", label: "Dispatched", icon: PackageCheck },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
] as const;

function OrderTracker({ status }: { status: string }) {
  const currentIndex = ORDER_STAGES.findIndex((s) => s.key === status);
  if (currentIndex === -1) return null;
  const progressPct = (currentIndex / (ORDER_STAGES.length - 1)) * 100;

  return (
    <div className="mt-3">
      <div className="relative flex items-center justify-between">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border" />
        <div
          className="absolute inset-y-0 left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-(--brand-blue) transition-[width]"
          style={{ width: `${progressPct}%` }}
        />
        {ORDER_STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const done = i <= currentIndex;
          return (
            <div
              key={stage.key}
              className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full ${
                done
                  ? "bg-(--brand-blue) text-white"
                  : "border border-border bg-card text-muted-foreground"
              }`}
            >
              <Icon className="size-3.5" />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between">
        {ORDER_STAGES.map((stage, i) => (
          <span
            key={stage.key}
            className={`w-14 text-center text-[10px] font-medium ${
              i <= currentIndex ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {stage.label}
          </span>
        ))}
      </div>
    </div>
  );
}

type Draft = {
  patientName: string | null;
  doctorName: string | null;
  prescriptionDate: string | null;
  notes: string | null;
  medicines: Medicine[];
  /** The original picked/captured file, base64-encoded — kept through to
   * send() so it can be forwarded as-is to POST /pharmacy-orders' multipart
   * `document` field. Not the OCR result, not a regenerated file. */
  dataUrl: string;
  fileName: string;
  mimeType: string | null;
  source: "upload" | "camera";
  previewUrl: string | null;
};

/**
 * Originally: resolve the QR-scanned pharmacy (Supabase `pharmacies` table)
 * to providerService's real serviceProviderId (a UUID), required by POST
 * /pharmacy-orders — left unimplemented because there was no verified
 * mapping between the two systems' ids, and the real backend genuinely
 * needs a valid UUID.
 *
 * NETWORK CALL DISABLED — that constraint no longer applies: submitPrescription
 * (via companyProviderApi in portal-auth.server.ts) is mocked end to end now,
 * so any UUID is fine — it's never sent anywhere real. Returns a fixed mock
 * id instead of the unresolved null this used to return, which used to block
 * "Send to pharmacy" outright in production (DEV had its own separate
 * demo-only bypass around the call site — see send() below, now removed
 * along with it since this covers both environments the same way). */
function resolvePharmacyServiceProviderId(
  pharmacy: { id: string; code: string; name: string } | null | undefined,
): string | null {
  void pharmacy;
  return "00000000-0000-4000-8000-000000000001";
}

// TEMPORARY DEV-ONLY AUTH BYPASS — DEV_AUTH_BYPASS is used below only to
// skip the real, CORS-affected getMe()/`/profile/me` browser call for a
// dev-bypass session (see the `me` query and its redirect effect further
// down in HomePage()). The session itself is no longer self-granted here on
// /home's own mount — Login/Sign Up (company-auth.client.ts's
// loginWithPin/setPin) now genuinely persist a dev-bypass-token session
// through the normal token store when the fixed DEV demo credentials are
// used, so the plain restoreSession() below picks it up like any other
// session. /home no longer grants access on its own; it still requires
// having gone through /login (or signup) first, same as production.
const DEV_AUTH_BYPASS = import.meta.env.DEV;

function HomePage() {
  const navigate = useNavigate();
  const [token, setTokenState] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payTargetId, setPayTargetId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  // "Take a photo" opens a live camera preview (CameraCapture) instead of a
  // file-picker input — see that component for why.
  const [cameraOpen, setCameraOpen] = useState(false);

  const uploadRef = useRef<HTMLInputElement>(null);

  const fetchPharmacy = useServerFn(getPharmacy);
  const analyze = useServerFn(analyzePrescription);
  const submit = useServerFn(submitPrescription);
  const listRx = useServerFn(listPrescriptions);
  const beginPayment = useServerFn(startPayment);
  const finishPayment = useServerFn(confirmPayment);

  // Cold-start session restore (AUTH_FLOW.md §7): trust a still-valid stored
  // token as-is, silently refresh an expired one if a refresh token exists,
  // and only fall back to the login screen if neither holds up. Runs
  // unconditionally, dev and prod alike — the DEV-only demo session (see
  // company-auth.client.ts) is persisted through the same token store this
  // reads, so it's picked up here exactly like a real session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await restoreSession();
      if (cancelled) return;
      if (!ok) {
        navigate({ to: "/login" });
        return;
      }
      setTokenState(getToken());
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me", token],
    enabled: Boolean(token) && !DEV_AUTH_BYPASS,
    queryFn: () => getMe(),
  });

  useEffect(() => {
    if (!DEV_AUTH_BYPASS && !meLoading && token && me === null) {
      clearSession();
      navigate({ to: "/login" });
    }
  }, [me, meLoading, token, navigate]);

  const pharmacyCode = typeof window !== "undefined" ? getPharmacyCode() : null;

  const { data: pharmacy } = useQuery({
    queryKey: ["pharmacy", pharmacyCode],
    queryFn: () => fetchPharmacy({ data: { code: pharmacyCode } }),
  });

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["prescriptions", token],
    enabled: Boolean(token),
    refetchInterval: 15_000,
    queryFn: () => listRx({ data: { token: token as string } }),
  });

  // "Pay now" opens MockPaymentDialog (order summary + amount + explicit
  // confirm) instead of resolving instantly — see that component's header
  // comment. payTargetId just tracks which order the dialog is open for;
  // confirmMockPayment below does the actual mocked startPayment/
  // confirmPayment call chain once the user taps "Pay" inside it.
  const payTarget = history?.find((r) => r.id === payTargetId) ?? null;

  const confirmMockPayment = async () => {
    if (!token || !payTargetId) return;
    setPayingId(payTargetId);
    try {
      const order = await beginPayment({ data: { token, prescriptionId: payTargetId } });
      // No real Razorpay checkout to round-trip through (see
      // razorpay-checkout.ts) — the dialog itself is the confirmation step,
      // so a fixed mock payment/signature stands in for what Razorpay's
      // handler would normally hand back.
      await finishPayment({
        data: {
          token,
          prescriptionId: payTargetId,
          razorpayOrderId: order.orderId,
          razorpayPaymentId: `mock_pay_${Date.now()}`,
          razorpaySignature: "mock-signature",
        },
      });
      toast.success("Payment successful — your pharmacy is preparing the order");
      await refetchHistory();
      setPayTargetId(null);
      setReceiptId(payTargetId);
    } catch (e) {
      toast.error(errorMessage(e, "Payment could not be completed"));
    } finally {
      setPayingId(null);
    }
  };

  const handleFile = async (file: File | undefined, source: "upload" | "camera") => {
    if (!file || !token) return;
    if (file.size > 9 * 1024 * 1024) {
      toast.error("That file is too large. Please keep it under 9 MB.");
      return;
    }
    const ok = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!ok) {
      toast.error("Please choose a PDF or a photo");
      return;
    }

    setAnalyzing(true);
    setDraft(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await analyze({
        data: {
          token,
          dataUrl,
          mimeType: file.type,
          fileName: file.name || "prescription",
          source,
        },
      });
      if (!res.medicines.length) {
        toast.error("No medicines could be read. Try a clearer photo.");
      }
      setDraft({
        patientName: res.patientName,
        doctorName: res.doctorName,
        prescriptionDate: res.prescriptionDate,
        notes: res.notes,
        medicines: res.medicines,
        // The original file, kept as-is through to send() — forwarded
        // verbatim as the multipart `document` field on POST
        // /pharmacy-orders, not the OCR result and not a regenerated file.
        dataUrl,
        fileName: file.name || "prescription",
        mimeType: res.mimeType,
        source,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
    } catch (e) {
      toast.error(errorMessage(e, "Could not read that prescription"));
    } finally {
      setAnalyzing(false);
    }
  };

  const updateMedicine = (index: number, patch: Partial<Medicine>) => {
    setDraft((d) =>
      d
        ? { ...d, medicines: d.medicines.map((m, i) => (i === index ? { ...m, ...patch } : m)) }
        : d,
    );
  };

  const send = async () => {
    if (!draft || !token) return;
    const medicines = draft.medicines.filter((m) => m.name.trim());
    if (!medicines.length) {
      toast.error("Add at least one medicine before sending");
      return;
    }

    const serviceProviderId = resolvePharmacyServiceProviderId(pharmacy);
    if (!serviceProviderId) {
      toast.error("This pharmacy is not linked to the SpotCare backend yet.");
      return;
    }

    setSending(true);
    try {
      await submit({
        data: {
          token,
          serviceProviderId,
          // The original file, unchanged since handleFile() — forwarded as
          // the multipart `document` field. patientId is resolved
          // server-side from the token (requireSession), not sent from here.
          dataUrl: draft.dataUrl,
          mimeType: draft.mimeType ?? "application/octet-stream",
          fileName: draft.fileName,
          // Mock-only enrichment (see PharmacyOrder in prescriptions.functions.ts)
          // so the new order shows a real summary in "Recent orders" and its
          // receipt, instead of coming back empty.
          patientName: draft.patientName ?? me?.full_name ?? null,
          doctorName: draft.doctorName,
          notes: draft.notes,
          medicines: medicines.map((m) => ({
            name: m.name,
            strength: m.strengthUnit ? `${m.strength ?? ""} ${m.strengthUnit}`.trim() : m.strength,
            dosage: m.frequency,
            duration: m.duration ? `${m.duration} ${m.durationUnit ?? ""}`.trim() : null,
            quantity: m.quantity,
            instructions: m.timing,
          })),
        },
      });
      toast.success(`Sent to ${pharmacy?.name ?? "the pharmacy"}`);
      setDraft(null);
      void refetchHistory();
    } catch (e) {
      toast.error(errorMessage(e, "Could not send the prescription"));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="brand-gradient px-5 pb-8 pt-8 text-primary-foreground">
        <div className="phone-shell grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] opacity-75">
              {pharmacy?.name ?? "Valli Pharmacy, Chromepet"}
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">
              {me?.full_name ? `Hi, ${me.full_name}` : "Your prescriptions"}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/12"
              aria-label="Security settings"
              onClick={() => navigate({ to: "/security" })}
            >
              <Settings className="size-4" />
            </button>
            <button
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/12"
              aria-label="Sign out"
              onClick={async () => {
                await signOut();
                navigate({ to: "/", search: { p: undefined } });
              }}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="phone-shell space-y-5 px-5 pt-5">
        <input
          ref={uploadRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0], "upload")}
        />
        <CameraCapture
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false);
            void handleFile(file, "camera");
          }}
        />

        <InstallShortcut />

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setCameraOpen(true)}
            disabled={analyzing}
            className="card-elevated flex flex-col items-start gap-3 rounded-2xl bg-accent p-4 text-left text-accent-foreground disabled:opacity-60"
          >
            <Camera className="size-6" />
            <span className="text-sm font-semibold">Take a photo</span>
          </button>
          <button
            onClick={() => uploadRef.current?.click()}
            disabled={analyzing}
            className="card-elevated flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left disabled:opacity-60"
          >
            <Upload className="size-6 text-accent" />
            <span className="text-sm font-semibold">Upload PDF or image</span>
          </button>
        </div>

        {analyzing ? (
          <div className="card-elevated flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <Loader2 className="size-5 shrink-0 animate-spin text-accent" />
            <p className="text-sm text-muted-foreground">
              Reading the medicines from your prescription…
            </p>
          </div>
        ) : null}

        {draft ? (
          <section className="card-elevated space-y-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="size-5 shrink-0 text-success" />
              <h2 className="truncate text-base font-semibold">Confirm the medicines</h2>
            </div>

            {draft.previewUrl ? (
              <img
                src={draft.previewUrl}
                alt="Prescription preview"
                className="h-44 w-full rounded-xl bg-muted object-contain"
              />
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="patient" className="text-xs">
                  Patient
                </Label>
                <Input
                  id="patient"
                  value={draft.patientName ?? ""}
                  onChange={(e) => setDraft({ ...draft, patientName: e.target.value })}
                  placeholder="Name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doctor" className="text-xs">
                  Doctor
                </Label>
                <Input
                  id="doctor"
                  value={draft.doctorName ?? ""}
                  onChange={(e) => setDraft({ ...draft, doctorName: e.target.value })}
                  placeholder="Name"
                />
              </div>
            </div>

            <ul className="space-y-3">
              {draft.medicines.map((m, i) => (
                <MedicineCard
                  key={i}
                  index={i}
                  medicine={m}
                  onChange={(patch) => updateMedicine(i, patch)}
                  onRemove={() =>
                    setDraft({ ...draft, medicines: draft.medicines.filter((_, x) => x !== i) })
                  }
                />
              ))}
            </ul>

            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={() =>
                setDraft({ ...draft, medicines: [...draft.medicines, { ...BLANK_MEDICINE }] })
              }
            >
              <Plus className="size-4" />
              Add a medicine
            </Button>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs">
                Doctor's Advice
              </Label>
              <Textarea
                id="notes"
                rows={2}
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="e.g. please substitute generics"
              />
            </div>

            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
              <Button variant="ghost" className="rounded-xl" onClick={() => setDraft(null)}>
                Discard
              </Button>
              <Button className="h-12 rounded-xl text-base" onClick={send} disabled={sending}>
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Send to pharmacy
              </Button>
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <ClipboardList className="size-4 shrink-0" />
            Recent orders
          </h2>
          {history && history.length ? (
            <ul className="space-y-3">
              {history.map((rx) => (
                <li
                  key={rx.id}
                  className="card-elevated rounded-2xl border border-border bg-card p-4"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {rx.prescription_items.map((i) => i.name).join(", ") || "Prescription"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {rx.prescription_items.length
                          ? `${new Date(rx.created_at).toLocaleString()} · ${
                              rx.prescription_items.length
                            } item${rx.prescription_items.length === 1 ? "" : "s"}`
                          : // providerService's pharmacy-orders don't carry a
                            // medicine count (see listPrescriptions in
                            // prescriptions.functions.ts) — say so plainly
                            // instead of a misleading "0 items".
                            `Prescription sent · ${new Date(rx.created_at).toLocaleString()}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                        rx.payment_status === "paid"
                          ? "bg-success/12 text-success"
                          : rx.quoted_amount
                            ? "bg-accent/12 text-accent"
                            : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {rx.payment_status === "paid"
                        ? "Paid"
                        : rx.quoted_amount
                          ? "Payment due"
                          : rx.status === "sent"
                            ? "Sent"
                            : rx.status}
                    </span>
                  </div>

                  <OrderTracker status={rx.status} />

                  {rx.quoted_amount && rx.payment_status !== "paid" ? (
                    <div className="mt-3 rounded-xl bg-secondary/70 p-3">
                      <p className="text-sm font-medium">
                        The pharmacy can deliver this order for{" "}
                        <span className="whitespace-nowrap font-semibold">
                          {rx.currency === "INR" ? "₹" : `${rx.currency ?? ""} `}
                          {Number(rx.quoted_amount).toFixed(2)}
                        </span>
                      </p>
                      {rx.pharmacy_message ? (
                        <p className="mt-1 text-xs text-muted-foreground">{rx.pharmacy_message}</p>
                      ) : null}
                      <Button
                        className="mt-3 h-11 w-full rounded-xl"
                        disabled={payingId === rx.id}
                        onClick={() => setPayTargetId(rx.id)}
                      >
                        {payingId === rx.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <IndianRupee className="size-4" />
                        )}
                        Pay now
                      </Button>
                    </div>
                  ) : null}

                  {rx.payment_status === "paid" ? (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-secondary/70 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {rx.currency === "INR" ? "₹" : `${rx.currency ?? ""} `}
                          {Number(rx.quoted_amount ?? 0).toFixed(2)} paid
                        </p>
                        {rx.paid_at ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {new Date(rx.paid_at).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        variant="outline"
                        className="h-10 shrink-0 rounded-xl"
                        onClick={() => setReceiptId(rx.id)}
                      >
                        <ReceiptText className="size-4" />
                        Receipt
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nothing sent yet. Add your first prescription above.
            </p>
          )}
        </section>
      </div>

      <MockPaymentDialog
        open={Boolean(payTargetId)}
        onOpenChange={(v) => !v && setPayTargetId(null)}
        order={payTarget}
        pharmacyName={pharmacy?.name ?? "the pharmacy"}
        busy={payingId === payTargetId}
        onConfirm={() => void confirmMockPayment()}
      />

      <PaymentReceiptDialog
        open={Boolean(receiptId)}
        onOpenChange={(v) => !v && setReceiptId(null)}
        pharmacy={pharmacy ?? null}
        order={history?.find((r) => r.id === receiptId) ?? null}
      />
    </main>
  );
}
