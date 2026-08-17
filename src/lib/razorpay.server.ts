import { createHmac, timingSafeEqual } from "crypto";

const API = "https://api.razorpay.com/v1";

function credentials() {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) {
    throw new Error("Online payment is not configured yet. Please contact the pharmacy.");
  }
  return { keyId, keySecret };
}

export function isRazorpayConfigured() {
  return Boolean(process.env["RAZORPAY_KEY_ID"] && process.env["RAZORPAY_KEY_SECRET"]);
}

// NETWORK CALL DISABLED — unreachable now (payments.functions.ts's mocked
// startPayment/confirmPayment no longer import these), kept commented out
// for reference.

// /** Creates a Razorpay order for the given amount (in major units, e.g. rupees). */
// export async function createRazorpayOrder(input: {
//   amount: number;
//   currency: string;
//   receipt: string;
//   notes?: Record<string, string>;
// }) {
//   const { keyId, keySecret } = credentials();
//   const res = await fetch(`${API}/orders`, {
//     method: "POST",
//     headers: {
//       "content-type": "application/json",
//       authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
//     },
//     body: JSON.stringify({
//       amount: Math.round(input.amount * 100),
//       currency: input.currency || "INR",
//       receipt: input.receipt,
//       notes: input.notes ?? {},
//     }),
//   });
//
//   if (!res.ok) {
//     console.error("razorpay order failed", res.status, await res.text());
//     throw new Error("Could not start the payment. Please try again.");
//   }
//   const order = (await res.json()) as { id: string; amount: number; currency: string };
//   return { orderId: order.id, amount: order.amount, currency: order.currency, keyId };
// }
//
// /** Verifies the checkout signature returned by Razorpay. */
// export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
//   const { keySecret } = credentials();
//   const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
//   const a = Buffer.from(expected);
//   const b = Buffer.from(signature);
//   return a.length === b.length && timingSafeEqual(a, b);
// }
