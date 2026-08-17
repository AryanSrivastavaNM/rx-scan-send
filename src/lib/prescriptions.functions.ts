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
 * paymentStatus/paidAt are NOT part of the real providerService response —
 * they only exist on the mocked companyProviderApi() data (see
 * portal-auth.server.ts) so listPrescriptions below can surface a
 * pending/paid demo state. Optional here so real (unmocked) responses,
 * which never include them, still type-check. */
type PharmacyOrder = {
  id: string;
  status: string;
  orderedAt: string;
  requestedAmount: number | string | null;
  fileUrl: string | null;
  paymentStatus?: "pending" | "paid";
  paidAt?: string | null;
};

export const submitPrescription = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(10),
        serviceProviderId: z.string().uuid(),
        dataUrl: z.string().min(30).max(14_000_000),
        mimeType: z.string().max(100),
        fileName: z.string().max(200),
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
    // `prescriptions` table. providerService's pharmacy-orders don't carry
    // medicine/patient/doctor fields — those lived only in the now-replaced
    // Supabase schema — so those come back null/empty here rather than
    // invented. quoted_amount is wired to the real requestedAmount the
    // pharmacy sets. payment_status/paid_at come from the mock's
    // paymentStatus/paidAt (see PharmacyOrder above) when present — a real
    // providerService response never sets them, so this stays null there,
    // same as before. razorpay_* still stay null either way: nothing in the
    // UI reads them directly.
    return (result.data ?? []).map((o) => ({
      id: o.id,
      status: o.status,
      created_at: o.orderedAt,
      doctor_name: null as string | null,
      patient_name: null as string | null,
      source: null as "upload" | "camera" | null,
      notes: null as string | null,
      quoted_amount: o.requestedAmount ?? null,
      currency: "INR" as string | null,
      pharmacy_message: null as string | null,
      payment_status: o.paymentStatus ?? (null as string | null),
      paid_at: o.paidAt ?? (null as string | null),
      razorpay_order_id: null as string | null,
      razorpay_payment_id: null as string | null,
      prescription_items: [] as {
        name: string;
        strength: string | null;
        dosage: string | null;
        duration: string | null;
        quantity: string | null;
        instructions: string | null;
      }[],
    }));
  });
