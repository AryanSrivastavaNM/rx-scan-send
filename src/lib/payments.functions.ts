import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  MOCK_PRESCRIPTION_1_AMOUNT,
  MOCK_PRESCRIPTION_1_ID,
  MOCK_PRESCRIPTION_2_AMOUNT,
  MOCK_PRESCRIPTION_2_ID,
  MOCK_PRESCRIPTION_3_AMOUNT,
  MOCK_PRESCRIPTION_3_ID,
  MOCK_PRESCRIPTION_4_AMOUNT,
  MOCK_PRESCRIPTION_4_ID,
  requireSession,
} from "./portal-auth.server";

const MOCK_AMOUNT_BY_ID: Record<string, number> = {
  [MOCK_PRESCRIPTION_1_ID]: MOCK_PRESCRIPTION_1_AMOUNT,
  [MOCK_PRESCRIPTION_2_ID]: MOCK_PRESCRIPTION_2_AMOUNT,
  [MOCK_PRESCRIPTION_3_ID]: MOCK_PRESCRIPTION_3_AMOUNT,
  [MOCK_PRESCRIPTION_4_ID]: MOCK_PRESCRIPTION_4_AMOUNT,
};

/** Creates a Razorpay order for a prescription the pharmacy has quoted.
 *
 * NETWORK CALL DISABLED — skips the Supabase lookup and the real Razorpay
 * order creation, returning a canned order instead. Real implementation
 * commented out below. */
export const startPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(10), prescriptionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireSession(data.token);
    const amount = MOCK_AMOUNT_BY_ID[data.prescriptionId] ?? MOCK_PRESCRIPTION_1_AMOUNT;

    return {
      orderId: `mock_order_${data.prescriptionId.slice(0, 8)}`,
      amount: Math.round(amount * 100),
      currency: "INR",
      keyId: "mock_razorpay_key_id",
    };

    // const db = await admin();
    //
    // const { data: rx } = await db
    //   .from("prescriptions")
    //   .select("id, user_id, quoted_amount, currency, payment_status")
    //   .eq("id", data.prescriptionId)
    //   .maybeSingle();
    //
    // if (!rx || rx.user_id !== user.id) throw new Error("Order not found");
    // if (!rx.quoted_amount || Number(rx.quoted_amount) <= 0) throw new Error("The pharmacy has not quoted this order yet");
    // if (rx.payment_status === "paid") throw new Error("This order is already paid");
    //
    // const { createRazorpayOrder } = await import("./razorpay.server");
    // const order = await createRazorpayOrder({
    //   amount: Number(rx.quoted_amount),
    //   currency: rx.currency ?? "INR",
    //   receipt: rx.id.slice(0, 32),
    //   notes: { prescription_id: rx.id },
    // });
    //
    // await db
    //   .from("prescriptions")
    //   .update({ razorpay_order_id: order.orderId, payment_status: "pending" })
    //   .eq("id", rx.id);
    //
    // return order;
  });

/** Confirms a completed Razorpay checkout and marks the order as paid.
 *
 * NETWORK CALL DISABLED — skips the Supabase lookup and the real signature
 * verification, always reporting success. Real implementation commented out
 * below. */
export const confirmPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(10),
        prescriptionId: z.string().uuid(),
        razorpayOrderId: z.string().min(5).max(120),
        razorpayPaymentId: z.string().min(5).max(120),
        razorpaySignature: z.string().min(10).max(300),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireSession(data.token);
    return { ok: true };

    // const db = await admin();
    //
    // const { data: rx } = await db
    //   .from("prescriptions")
    //   .select("id, user_id, razorpay_order_id")
    //   .eq("id", data.prescriptionId)
    //   .maybeSingle();
    //
    // if (!rx || rx.user_id !== user.id) throw new Error("Order not found");
    // if (rx.razorpay_order_id !== data.razorpayOrderId) throw new Error("Payment does not match this order");
    //
    // const { verifyRazorpaySignature } = await import("./razorpay.server");
    // if (!verifyRazorpaySignature(data.razorpayOrderId, data.razorpayPaymentId, data.razorpaySignature)) {
    //   await db.from("prescriptions").update({ payment_status: "failed" }).eq("id", rx.id);
    //   throw new Error("We could not verify that payment");
    // }
    //
    // await db
    //   .from("prescriptions")
    //   .update({
    //     payment_status: "paid",
    //     razorpay_payment_id: data.razorpayPaymentId,
    //     paid_at: new Date().toISOString(),
    //     status: "paid",
    //   })
    //   .eq("id", rx.id);
    //
    // return { ok: true };
  });
