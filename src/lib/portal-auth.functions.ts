import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// NETWORK CALL DISABLED — returns a canned pharmacy record instead of
// querying Supabase. Real implementation commented out below.
export const getPharmacy = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code: z.string().max(60).nullable() }).parse(d))
  .handler(async ({ data }) => {
    return {
      id: "mock-pharmacy-id",
      code: data.code ?? "MOCK001",
      name: "Valli Pharmacy, Chromepet",
      tagline: "Prescription service portal",
      address: "12 Anna Salai, Chromepet, Chennai 600044",
      phone: "+91 44 2345 6789",
      hours: "Mon–Sat, 8:00 AM – 10:00 PM",
      logo_url: "/logo.png",
    };

    // const db = await admin();
    // const query = db
    //   .from("pharmacies")
    //   .select("id, code, name, tagline, address, phone, hours, logo_url");
    // const { data: row } = data.code
    //   ? await query.eq("code", data.code).maybeSingle()
    //   : await query.order("created_at").limit(1).maybeSingle();
    // return row ?? null;
  });

// requestOtp, verifyOtp, setPin, loginWithPin, refreshSession, getMe and
// signOut used to live here as TanStack Start server functions, proxying to
// the company's SpotCare authService. They now call that backend directly
// from the browser instead — see company-auth.client.ts.
