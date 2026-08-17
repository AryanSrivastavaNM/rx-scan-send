// Server-side helpers.
//
// The login/OTP/PIN/session flow itself (register, send/verify OTP, set PIN,
// login, refresh, logout) now calls the company's SpotCare authService
// directly from the browser — see company-auth.client.ts — no server-side
// proxy. What's left here is requireSession(), which is still called
// server-side to authorize the company-backend-facing prescriptions/payments
// server functions: those need to validate a caller's token before making
// authenticated calls on their behalf, and doing that check server-side
// (rather than trusting a client-asserted user id) is the point.
//
// companyProviderApi() below is the providerService counterpart of
// companyApi() — same response envelope/error handling, but for pharmacy
// orders (multipart form data), not JSON auth calls.
//
// admin() is intentionally UNCHANGED and still Supabase-backed: payments are
// explicitly out of scope for this migration (payments.functions.ts still
// depends on it, and still requires SUPABASE_SERVICE_ROLE_KEY to be set,
// until it's migrated in a later pass). Pharmacy-order submission/history
// (prescriptions.functions.ts) has been migrated off Supabase onto
// companyProviderApi() below.

import { createMockOrder, listMockOrders, type MockOrderItem } from "./mock-orders.server";

const COMPANY_API_BASE_URL = process.env["COMPANY_API_BASE_URL"];
const PROVIDER_API_BASE_URL = process.env["PROVIDER_API_BASE_URL"];

type CompanyEnvelope<T> = { status: number; message: string; data?: T };

// NETWORK CALL DISABLED — requireSession() below no longer routes through
// this function (it returns a mock user directly), so nothing currently
// calls companyApi(). Left in place, real fetch commented out, in case
// something needs it again.
async function companyApi<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown; token?: string },
): Promise<T> {
  throw new Error(`companyApi() is mocked/disabled — attempted call to ${path}`);

  // if (!COMPANY_API_BASE_URL) {
  //   throw new Error("Company backend is not configured. Set COMPANY_API_BASE_URL.");
  // }
  //
  // const res = await fetch(`${COMPANY_API_BASE_URL}${path}`, {
  //   method: init?.method ?? "GET",
  //   headers: {
  //     "Content-Type": "application/json",
  //     ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
  //   },
  //   ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  // });
  //
  // let body: CompanyEnvelope<T> | null = null;
  // try {
  //   body = (await res.json()) as CompanyEnvelope<T>;
  // } catch {
  //   // No/invalid JSON body — fall through to the generic status-based error below.
  // }
  //
  // if (!res.ok) {
  //   throw new Error(body?.message || `Request failed (${res.status})`);
  // }
  // return (body?.data ?? (body as unknown as T)) as T;
}

/** providerService counterpart of companyApi() — same response envelope and
 * error handling, but the request body is a FormData instance (multipart),
 * not JSON. No Content-Type header is set here: fetch/undici derives the
 * correct `multipart/form-data; boundary=...` header from the FormData body
 * itself — setting one manually would drop that boundary and break the
 * upload. Used by submitPrescription/listPrescriptions in
 * prescriptions.functions.ts to call POST/GET /pharmacy-orders. */
// NETWORK CALL DISABLED — backed by the in-memory store in
// mock-orders.server.ts instead of calling the real providerService, so a
// submission and a payment actually change what listPrescriptions returns
// afterward. Real fetch commented out below.
export async function companyProviderApi<T = unknown>(
  path: string,
  init: { method?: string; token: string; formData?: FormData },
): Promise<T> {
  const method = init.method ?? "GET";
  if (path === "/pharmacy-orders" && method === "POST") {
    const form = init.formData;
    const patientId = String(form?.get("patientId") ?? "");
    const patientName = (form?.get("patientName") as string | null) || null;
    const doctorName = (form?.get("doctorName") as string | null) || null;
    const notes = (form?.get("notes") as string | null) || null;
    let items: MockOrderItem[] = [];
    try {
      const raw = form?.get("items");
      if (typeof raw === "string") items = JSON.parse(raw) as MockOrderItem[];
    } catch {
      // Malformed/absent — fall back to no line items rather than failing the submission.
    }

    const order = createMockOrder({ patientId, patientName, doctorName, notes, items });
    return {
      id: order.id,
      status: order.status,
      orderedAt: order.orderedAt,
      requestedAmount: order.requestedAmount,
      fileUrl: order.fileUrl,
      paymentStatus: order.paymentStatus,
      paidAt: order.paidAt,
    } as T;
  }

  // GET /pharmacy-orders?patientId=... (listPrescriptions)
  const patientId = new URL(path, "https://mock.local").searchParams.get("patientId") ?? "";
  const list = listMockOrders(patientId);
  return {
    data: list.map((o) => ({
      id: o.id,
      status: o.status,
      orderedAt: o.orderedAt,
      requestedAmount: o.requestedAmount,
      fileUrl: o.fileUrl,
      paymentStatus: o.paymentStatus,
      paidAt: o.paidAt,
      patientId: o.patientId,
      patientName: o.patientName,
      doctorName: o.doctorName,
      notes: o.notes,
      items: o.items,
    })),
    count: list.length,
  } as T;

  // if (!PROVIDER_API_BASE_URL) {
  //   throw new Error("Provider backend is not configured. Set PROVIDER_API_BASE_URL.");
  // }
  //
  // const res = await fetch(`${PROVIDER_API_BASE_URL}${path}`, {
  //   method: init.method ?? "GET",
  //   headers: { Authorization: `Bearer ${init.token}` },
  //   ...(init.formData ? { body: init.formData } : {}),
  // });
  //
  // let body: CompanyEnvelope<T> | null = null;
  // try {
  //   body = (await res.json()) as CompanyEnvelope<T>;
  // } catch {
  //   // No/invalid JSON body — fall through to the generic status-based error below.
  // }
  //
  // if (!res.ok) {
  //   throw new Error(body?.message || `Request failed (${res.status})`);
  // }
  // return (body?.data ?? (body as unknown as T)) as T;
}

export type PortalUser = { id: string; phone: string; full_name: string | null };

// TEMPORARY DEV-ONLY AUTH BYPASS — paired with the matching block in
// home.tsx. Lets server functions (analyzePrescription, listPrescriptions,
// submitPrescription, ...) accept the fixed sentinel token home.tsx sends in
// dev instead of validating a real company-auth session, so the Qwen OCR
// image path can be tested locally while the real browser CORS issue on the
// AWS Gateway login flow is being fixed separately. Double-gated: requires
// BOTH the exact sentinel string AND a non-production NODE_ENV, so it can't
// be reached in a production build/deploy regardless of what token value a
// client sends. To remove: delete this const + the `if` block below it (and
// the matching DEV_AUTH_BYPASS block in home.tsx).
//
// NOTE: DEV_BYPASS_USER.id ("dev-bypass-user") is not a UUID — the real
// pharmacy-orders backend requires patientId to be one (createOrderSchema,
// providerService), so exercising submitPrescription end-to-end under this
// bypass will 400 at the backend even though the request reaches it. This
// is a known limitation of the bypass, not a bug in submitPrescription.
const DEV_BYPASS_TOKEN = "dev-bypass-token";
// id matches MOCK_USER_ID in company-auth.client.ts (the client-side mock
// getMe()/profile identity) and the seed data in mock-orders.server.ts, so
// the same mock "Test User" identity is consistent client- and server-side
// — mock-orders.server.ts's listMockOrders(patientId) filters by this id.
const DEV_BYPASS_USER: PortalUser = {
  id: "mock-user-id",
  phone: "9999999999",
  full_name: "Test User",
};

/** Validates an access token against the company backend and maps its profile
 * response into the shape the rest of this app already expects — unchanged
 * from the previous Supabase-backed session shape, so callers (getMe,
 * prescriptions.functions.ts, payments.functions.ts) need no changes.
 *
 * NETWORK CALL DISABLED — any non-empty token is accepted and mapped to a
 * fake user instead of being validated against companyApi(). Real
 * implementation commented out below. */
export async function requireSession(token: string | undefined | null): Promise<PortalUser> {
  if (!token) throw new Error("Not signed in");
  return DEV_BYPASS_USER;

  // if (process.env["NODE_ENV"] !== "production" && token === DEV_BYPASS_TOKEN) {
  //   return DEV_BYPASS_USER;
  // }
  // try {
  //   const me = await companyApi<{ id: string; phone: string; displayName: string | null }>(
  //     "/profile/me",
  //     { token },
  //   );
  //   return { id: me.id, phone: me.phone, full_name: me.displayName ?? null };
  // } catch {
  //   throw new Error("Session expired, please sign in again");
  // }
}

// ─── Supabase — deliberately unmigrated (payments only) ─────────────────────
export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
