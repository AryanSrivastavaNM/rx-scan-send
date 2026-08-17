const TOKEN_KEY = "rx_portal_token";
const REFRESH_TOKEN_KEY = "rx_portal_refresh_token";
const TOKEN_EXPIRES_AT_KEY = "rx_portal_token_expires_at";
const SESSION_ID_KEY = "rx_portal_session_id";
const PHARMACY_KEY = "rx_portal_pharmacy";
const PHONE_KEY = "rx_portal_phone";

const read = (k: string) => (typeof window === "undefined" ? null : window.localStorage.getItem(k));
const write = (k: string, v: string | null) => {
  if (typeof window === "undefined") return;
  if (v) window.localStorage.setItem(k, v);
  else window.localStorage.removeItem(k);
};

// "Token" = the company backend's short-lived access token, used as the
// Bearer header on every authenticated call — same key/name as before the
// SpotCare migration, so existing call sites didn't need to change.
export const getToken = () => read(TOKEN_KEY);
export const setToken = (v: string | null) => write(TOKEN_KEY, v);
// The longer-lived refresh token, needed for POST /auth/token/refresh and
// POST /auth/logout.
export const getRefreshToken = () => read(REFRESH_TOKEN_KEY);
export const setRefreshToken = (v: string | null) => write(REFRESH_TOKEN_KEY, v);

// ISO-8601 string. Unlike AUTH_FLOW.md §6's mobile client (which stamps a
// hardcoded "now + 14 minutes" guess, since it never reads the JWT), this is
// decoded from the access token's real `exp` claim in company-auth.client.ts
// — the doc itself recommends doing that over hardcoding a guess.
export const getTokenExpiresAt = () => read(TOKEN_EXPIRES_AT_KEY);
export const setTokenExpiresAt = (v: string | null) => write(TOKEN_EXPIRES_AT_KEY, v);

// Only overwritten when a response actually includes one — refresh doesn't
// echo it back (AUTH_FLOW.md §6), so callers should leave it untouched then.
export const getSessionId = () => read(SESSION_ID_KEY);
export const setSessionId = (v: string | null) => write(SESSION_ID_KEY, v);

export const getPharmacyCode = () => read(PHARMACY_KEY);
export const setPharmacyCode = (v: string | null) => write(PHARMACY_KEY, v);
export const getLastPhone = () => read(PHONE_KEY);
export const setLastPhone = (v: string | null) => write(PHONE_KEY, v);

/** Wipes everything that identifies the signed-in session — but, per
 * AUTH_FLOW.md §6, deliberately leaves the device id (a separate key, see
 * device.ts) and the pharmacy/phone convenience fields untouched. */
export function clearSession() {
  setToken(null);
  setRefreshToken(null);
  setTokenExpiresAt(null);
  setSessionId(null);
}

export function errorMessage(e: unknown, fallback = "Something went wrong") {
  if (e instanceof Error && e.message) return e.message.replace(/^Error:\s*/, "");
  return fallback;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}
