import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

const bodySchema = z.object({
  prescriptionId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  currency: z.string().length(3).optional(),
  message: z.string().max(300).optional(),
});

function authorized(request: Request) {
  const expected = process.env["PHARMACY_API_KEY"];
  if (!expected) return false;
  const provided = request.headers.get("x-pharmacy-key") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by the pharmacy's own app to confirm an order and quote the amount payable.
 * POST { prescriptionId, amount, currency?, message? } with header: x-pharmacy-key
 */
export const Route = createFileRoute("/api/public/pharmacy/quote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid request body" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("prescriptions")
          .update({
            quoted_amount: parsed.amount,
            currency: parsed.currency ?? "INR",
            pharmacy_message: parsed.message ?? null,
            quoted_at: new Date().toISOString(),
            status: "quoted",
            payment_status: "awaiting_payment",
          })
          .eq("id", parsed.prescriptionId)
          .select("id")
          .maybeSingle();

        if (error) return Response.json({ error: "Could not update the order" }, { status: 500 });
        if (!data) return Response.json({ error: "Order not found" }, { status: 404 });

        return Response.json({ ok: true, prescriptionId: data.id });
      },
    },
  },
});
