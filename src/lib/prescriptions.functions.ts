import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { companyProviderApi, requireSession } from "./portal-auth.server";
import { extractFromFile } from "./prescriptions.server";

export const analyzePrescription = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(10),
        dataUrl: z.string().min(30).max(14_000_000),
        mimeType: z.string().max(100),
        fileName: z.string().max(200),
        source: z.enum(["upload", "camera"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireSession(data.token);
    const extracted = await extractFromFile(data.dataUrl, data.mimeType, data.fileName);
    // The original file is no longer persisted here (Supabase Storage
    // upload removed) — it stays client-side (Draft.dataUrl in home.tsx)
    // and is sent straight to POST /pharmacy-orders as the multipart
    // `document` field when the user actually sends the order. See
    // submitPrescription below.
    return { ...extracted, mimeType: data.mimeType, source: data.source };
  });

/** Shape returned by providerService for a pharmacy order (see
 * providerService/src/services/pharmacyOrders/index.js on the `development`
 * branch — presignOrder() strips s3Key and adds fileUrl). Only the fields
 * this app actually reads are declared here.
 *
 * paymentStatus/paidAt/patientId/patientName/doctorName/notes/items are NOT
 * part of the real providerService response — they only exist on the mocked
 * companyProviderApi() data (see portal-auth.server.ts / mock-orders.server.ts)
 * so listPrescriptions below can surface a real order summary + payment
 * state. Optional here so real (unmocked) responses, which never include
 * them, still type-check. */
type PharmacyOrderItem = {
  name: string;
  strength: string | null;
  dosage: string | null;
  duration: string | null;
  quantity: string | null;
  instructions: string | null;
};

type PharmacyOrder = {
  id: string;
  status: string;
  orderedAt: string;
  requestedAmount: number | string | null;
  fileUrl: string | null;
  paymentStatus?: "pending" | "paid";
  paidAt?: string | null;
  patientId?: string | null;
  patientName?: string | null;
  doctorName?: string | null;
  notes?: string | null;
  items?: PharmacyOrderItem[];
};

const medicineSchema = z.object({
  name: z.string(),
  strength: z.string().nullable(),
  dosage: z.string().nullable(),
  duration: z.string().nullable(),
  quantity: z.string().nullable(),
  instructions: z.string().nullable(),
});

export const submitPrescription = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(10),
        serviceProviderId: z.string().uuid(),
        dataUrl: z.string().min(30).max(14_000_000),
        mimeType: z.string().max(100),
        fileName: z.string().max(200),
        // Only used to enrich the mock order store (see PharmacyOrder above)
        // — the real providerService contract has no place for these on
        // POST /pharmacy-orders, it only wants the raw file.
        patientName: z.string().nullable().optional(),
        doctorName: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        medicines: z.array(medicineSchema).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireSession(data.token);

    const base64 = data.dataUrl.split(",")[1] ?? "";
    const buffer = Buffer.from(base64, "base64");

    const formData = new FormData();
    formData.append("serviceProviderId", data.serviceProviderId);
    formData.append("patientId", user.id);
    formData.append("patientName", data.patientName ?? user.full_name ?? "");
    formData.append("doctorName", data.doctorName ?? "");
    formData.append("notes", data.notes ?? "");
    formData.append("items", JSON.stringify(data.medicines ?? []));
    // The ORIGINAL uploaded/captured prescription file, exactly as picked by
    // the user — not the OCR result, not a regenerated document.
    // appointmentsId / totalAmount / requestedAmount are deliberately
    // omitted: the existing backend contract treats all three as optional
    // for this flow (no appointment is created; the pharmacy sets
    // requestedAmount later via its own PATCH .../status call).
    formData.append("document", new Blob([buffer], { type: data.mimeType }), data.fileName);

    const order = await companyProviderApi<PharmacyOrder>("/pharmacy-orders", {
      method: "POST",
      token: data.token,
      formData,
    });

    return { id: order.id };
  });

export const listPrescriptions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireSession(data.token);
    const result = await companyProviderApi<{ data: PharmacyOrder[]; count: number }>(
      `/pharmacy-orders?patientId=${encodeURIComponent(user.id)}`,
      { method: "GET", token: data.token },
    );

    // Mapped into the row shape the UI already expects (home.tsx's "Recent
    // orders" list, PaymentReceiptDialog) from the previous Supabase-backed
    // `prescriptions` table. A real (unmocked) providerService response
    // doesn't carry medicine/patient/doctor/payment fields — those lived
    // only in the now-replaced Supabase schema — so those fall back to
    // null/empty in that case. Against the mock (see PharmacyOrder above),
    // patient_id/patient_name/doctor_name/notes/prescription_items/
    // payment_status/paid_at all come through with real values captured at
    // submission time (or the seed data). razorpay_* stay null either way:
    // nothing in the UI reads them directly.
    return (result.data ?? []).map((o) => ({
      id: o.id,
      status: o.status,
      created_at: o.orderedAt,
      patient_id: o.patientId ?? (null as string | null),
      doctor_name: o.doctorName ?? (null as string | null),
      patient_name: o.patientName ?? (null as string | null),
      source: null as "upload" | "camera" | null,
      notes: o.notes ?? (null as string | null),
      quoted_amount: o.requestedAmount ?? null,
      currency: "INR" as string | null,
      pharmacy_message: null as string | null,
      payment_status: o.paymentStatus ?? (null as string | null),
      paid_at: o.paidAt ?? (null as string | null),
      razorpay_order_id: null as string | null,
      razorpay_payment_id: null as string | null,
      prescription_items: (o.items ?? []) as {
        name: string;
        strength: string | null;
        dosage: string | null;
        duration: string | null;
        quantity: string | null;
        instructions: string | null;
      }[],
    }));
  });
