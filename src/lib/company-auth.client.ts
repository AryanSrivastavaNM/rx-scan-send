// Client-side helpers — called directly from the browser, no server-function
// hop (the AWS API Gateway in front of SpotCare's authService has CORS
// enabled for browser origins). Implements the full flow documented in
// AUTH_FLOW.md: registration, PIN login (with the doc's exact error
// branching), forgot-PIN, change-PIN, token refresh (reactive-on-401 +
// coalesced, plus cold-start restore), sign out, sessions, and auth-method
// listing/unlinking.
//
// AUTH_FLOW.md was written against the doctor mobile app (`appType:
// "doctor"`); this is the patient web portal talking to the same backend,
// so device.ts sends `"patient"` and web-appropriate device fields instead
// — everything else (endpoints, payloads, response shapes, error-message
// branching) is unchanged, since it's the same authService.
//
// requireSession() in portal-auth.server.ts still calls this same backend
// server-side, but that's a separate concern — it authorizes the (still
// Supabase-backed) prescriptions/payments server functions, not this login
// flow, so it stays put and keeps its own copy of the request helper.

import {
  clearSession,
  getRefreshToken,
  getSessionId,
  getToken,
  getTokenExpiresAt,
  setRefreshToken,
  setSessionId,
  setToken,
  setTokenExpiresAt,
} from "./portal-client";
import { APP_TYPE, DEVICE_NAME, DEVICE_OS, PLACEHOLDER_DISPLAY_NAME, getDeviceId } from "./device";
import { CompanyAuthError } from "./company-auth-error";

const COMPANY_API_BASE_URL = import.meta.env["VITE_COMPANY_API_BASE_URL"] as string | undefined;

// NOTE ON THE DOUBLE "/auth" — this is intentional, not a bug. authService's
// own Fastify app mounts register/login/logout/refresh under its own internal
// "/api/v1/auth" prefix, while VITE_COMPANY_API_BASE_URL already ends in
// ".../auth/api/v1" — that first "/auth" is API Gateway's *service selector*
// (routes to the authService Lambda), a separate concern from authService's
// own internal prefix. By contrast, "/profile/me" and "/sessions" are NOT
// under authService's own "/auth" prefix (sibling route groups), so they're
// called with no extra "/auth" segment.

// ─── Low-level request plumbing ─────────────────────────────────────────

type CompanyEnvelope<T> = { status: number; message?: string; data?: T };

/** Paths that must never trigger a reactive refresh-on-401 (AUTH_FLOW.md §6)
 * — a 401 from these means "wrong PIN" / "bad refresh token" / etc, not "my
 * access token expired," so retrying them after a refresh would be wrong. */
const REFRESH_EXEMPT_PREFIXES = [
  "/auth/login",
  "/auth/token/refresh",
  "/auth/register",
  "/auth/logout",
];
function isRefreshExempt(path: string): boolean {
  return REFRESH_EXEMPT_PREFIXES.some((p) => path.startsWith(p));
}

// ALL NETWORK CALLS DISABLED — every request below is answered locally by
// mockCompanyResponse() instead of hitting the real SpotCare backend. The
// real implementation is kept commented out beneath it so this is a one-line
// flip to restore.
async function rawRequest<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; body: CompanyEnvelope<T> | null }> {
  return { ok: true, status: 200, body: mockCompanyResponse<T>(path, init) };

  // if (!COMPANY_API_BASE_URL) {
  //   throw new Error("Company backend is not configured. Set VITE_COMPANY_API_BASE_URL.");
  // }
  //
  // // Attached unconditionally, including to public endpoints — safe, since
  // // there's nothing to attach before login anyway and the backend ignores
  // // the header on those routes (AUTH_FLOW.md §6).
  // const token = getToken();
  //
  // const res = await fetch(`${COMPANY_API_BASE_URL}${path}`, {
  //   method: init?.method ?? "GET",
  //   headers: {
  //     "Content-Type": "application/json",
  //     ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  // return { ok: res.ok, status: res.status, body };
}

const MOCK_USER_ID = "mock-user-id";
const MOCK_PHONE = "9999999999";
const MOCK_DISPLAY_NAME = "Test User";
const MOCK_ACCESS_TOKEN = "mock-access-token";
const MOCK_REFRESH_TOKEN = "mock-refresh-token";
const MOCK_SESSION_ID = "mock-session-id";

/** Canned success payload per endpoint, standing in for the real SpotCare
 * response — see rawRequest() above. Shapes match what each caller in this
 * file already unwraps from `body.data`. */
function mockCompanyResponse<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): CompanyEnvelope<T> {
  const method = init?.method ?? "GET";

  if (path === "/auth/register/complete") {
    return {
      status: 200,
      data: {
        user: { id: MOCK_USER_ID, phone: MOCK_PHONE, displayName: MOCK_DISPLAY_NAME },
        accessToken: MOCK_ACCESS_TOKEN,
        refreshToken: MOCK_REFRESH_TOKEN,
        sessionId: MOCK_SESSION_ID,
      } as T,
    };
  }
  if (path === "/auth/login" || path === "/auth/token/refresh") {
    return {
      status: 200,
      data: {
        accessToken: MOCK_ACCESS_TOKEN,
        refreshToken: MOCK_REFRESH_TOKEN,
        sessionId: MOCK_SESSION_ID,
      } as T,
    };
  }
  if (path === "/profile/me") {
    return {
      status: 200,
      data: { id: MOCK_USER_ID, phone: MOCK_PHONE, displayName: MOCK_DISPLAY_NAME } as T,
    };
  }
  if (path === "/sessions" && method === "GET") {
    const now = Date.now();
    return {
      status: 200,
      data: [
        {
          id: MOCK_SESSION_ID,
          deviceId: "mock-device-current",
          deviceName: DEVICE_NAME,
          deviceOs: DEVICE_OS,
          appType: APP_TYPE,
          ipAddress: "127.0.0.1",
          lastActiveAt: new Date(now).toISOString(),
          createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "mock-session-2",
          deviceId: "mock-device-2",
          deviceName: "iPhone 14",
          deviceOs: "iOS 18",
          appType: "patient",
          ipAddress: "203.0.113.42",
          lastActiveAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ] as T,
    };
  }
  if (path === "/auth/methods" && method === "GET") {
    return {
      status: 200,
      data: {
        methods: [
          {
            id: "mock-method-pin",
            loginMethod: "pin",
            isPrimary: true,
            isActive: true,
            createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      } as T,
    };
  }
  if (path === "/auth/methods" && method === "POST") {
    return {
      status: 200,
      data: {
        method: { id: "mock-method-id", loginMethod: "google", isPrimary: false, isActive: true },
      } as T,
    };
  }
  // register/otp/send, register/otp/verify, register/pin, logout,
  // pin/forgot/*, methods/pin/change/*, sessions DELETE, methods/:id DELETE —
  // none of these callers read `data`, an empty object is enough.
  return { status: 200, data: {} as T };
}

let refreshInFlight: Promise<boolean> | null = null;

/** Coalesced — if several calls 401 around the same time (or a cold-start
 * restore races a reactive refresh), only one real POST /auth/token/refresh
 * goes out; everyone awaits the same result (AUTH_FLOW.md §6). */
function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  const result = await rawRequest<{ accessToken: string; refreshToken: string }>(
    "/auth/token/refresh",
    {
      method: "POST",
      body: { refreshToken: rt },
    },
  );
  if (!result.ok || !result.body?.data) return false;
  // No sessionId in the refresh response — keep whatever's already stored.
  persistTokens(result.body.data.accessToken, result.body.data.refreshToken);
  return true;
}

async function companyApi<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let result = await rawRequest<T>(path, init);

  if (result.status === 401 && !isRefreshExempt(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      result = await rawRequest<T>(path, init);
    } else {
      clearSession();
    }
  }

  if (!result.ok) {
    throw new CompanyAuthError(
      result.body?.message || `Request failed (${result.status})`,
      result.status,
    );
  }
  return (result.body?.data ?? (result.body as unknown as T)) as T;
}

// ─── Token persistence ───────────────────────────────────────────────────

function decodeJwtExpMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
    };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Used only as a fallback when the access token isn't a decodable JWT — this
// mirrors AUTH_FLOW.md §6's mobile client, which always hardcodes "now + 14
// minutes" because it never reads the token at all. Reading the real `exp`
// claim (below) is what the doc itself recommends doing instead, so this
// path should rarely if ever fire.
const FALLBACK_TTL_MS = 14 * 60 * 1000;

function persistTokens(accessToken: string, refreshToken: string, sessionId?: string | null) {
  setToken(accessToken);
  setRefreshToken(refreshToken);
  const expMs = decodeJwtExpMs(accessToken);
  setTokenExpiresAt(new Date(expMs ?? Date.now() + FALLBACK_TTL_MS).toISOString());
  if (sessionId) setSessionId(sessionId);
}

/** Cold-start session restore (AUTH_FLOW.md §7) — call once when the app
 * mounts, before trusting any stored token. Returns true if the caller can
 * proceed as authenticated (token valid, or a silent refresh succeeded);
 * false means route to sign-in. Never throws. */
export async function restoreSession(): Promise<boolean> {
  const token = getToken();
  if (!token) {
    clearSession();
    return false;
  }

  const expiresAt = getTokenExpiresAt();
  const isExpired = !expiresAt || new Date(expiresAt).getTime() <= Date.now();
  if (!isExpired) return true;

  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    clearSession();
    return false;
  }
  return true;
}

function deviceFields() {
  return {
    deviceId: getDeviceId(),
    deviceName: DEVICE_NAME,
    deviceOs: DEVICE_OS,
    appType: APP_TYPE,
  };
  // No fcmToken — this project has no web-push wiring, and AUTH_FLOW.md says
  // to omit the field entirely (not send it as null) when unavailable.
}

/** SpotCare requires digits only (no "+"), e.g. "+91 98765 43210" → "919876543210". */
function toCompanyPhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

// ─── TEMPORARY DEV-ONLY DEMO AUTH ────────────────────────────────────────
//
// Lets the existing Login and Sign Up screens (login.tsx — unchanged) be
// demoed end-to-end without the real, currently CORS-blocked SpotCare
// authService. This form has no email/password fields — phone + PIN is the
// existing credential pair — so the "demo credentials" are a fixed demo
// phone + PIN instead. Every function below still throws the exact same
// typed errors (CompanyAuthError) or plain Errors the real API would, so
// login.tsx's existing error UI (wrong-account dialog, locked screen,
// attempts-remaining banner, generic toasts) fires exactly as it does
// today — nothing new is added, nothing here is skipped from the caller's
// perspective.
//
// Double-gated: only active under `import.meta.env.DEV`, which is
// statically false in a production build — this map and every branch below
// are dead code (and the real API calls beneath them are what ships)
// outside `vite dev`. Production never sees these credentials.
//
// Keyed by bare 10-digit Indian number (see last10Digits() below) so a
// lookup works regardless of which country-code prefix the phone field
// happens to have prepended. OTPs are 4 digits, not the 6 originally
// specified — login.tsx's existing OTP <Input> has maxLength={4}
// (unmodified), so a 6-digit code can't physically be entered; these are
// the first 4 digits of each originally-given code.
const DEV_DEMO_ACCOUNTS: Record<string, { otp: string; pin: string }> = {
  "9871634285": { otp: "4837", pin: "1234" },
  "8762543197": { otp: "7163", pin: "2580" },
  "9098762143": { otp: "5928", pin: "4826" },
};

/** Normalizes any representation the phone field can produce — "9871634285",
 * "+919871634285", "919871634285" — down to the bare 10-digit Indian
 * number, so DEV_DEMO_ACCOUNTS lookups match regardless of the country-code
 * prefix login.tsx's Select has prepended. toCompanyPhone() only strips
 * non-digit characters (keeps a "91" dial-code prefix intact), which isn't
 * enough on its own for this lookup. Not a general phone utility — scoped
 * to this DEV-only comparison. */
function last10Digits(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

// Must stay string-identical to DEV_BYPASS_TOKEN in portal-auth.server.ts's
// requireSession() — that's the sentinel it recognizes server-side. Not a
// JWT; persistTokens()'s decodeJwtExpMs() below already handles a
// non-JWT token gracefully (falls back to its existing 14-minute TTL).
const DEV_BYPASS_TOKEN = "dev-bypass-token";

// ─── Registration (AUTH_FLOW.md §2) ─────────────────────────────────────

/** Step 1 ("check") is deliberately skipped — this app has explicit Sign In
 * / Sign Up buttons rather than one auto-detecting phone screen, so there's
 * nothing to check: the button the user clicked already says which flow
 * they want, with zero API calls fired just from typing a phone number.
 * If someone hits Sign Up with an already-registered number, the backend
 * will reject the eventual register/pin or register/complete call instead
 * of this being caught early — that trade-off is intentional here. */
export const sendSignUpOtp = async (input: { data: { phone: string } }) => {
  const { phone } = input.data;
  if (!isValidPhone(phone)) throw new Error("Enter a valid mobile number");

  if (import.meta.env.DEV && DEV_DEMO_ACCOUNTS[last10Digits(phone)]) {
    // No real OTP is sent — verifyOtp() below checks against this demo
    // account's fixed code instead. The UI still visibly moves to the
    // OTP-entry screen exactly as it does for a real signup; only the
    // network call is swapped. A non-demo phone falls through to the real
    // API below even in dev.
    return { phone };
  }

  await companyApi("/auth/register/otp/send", {
    method: "POST",
    body: { phone: toCompanyPhone(phone) },
  });
  return { phone };
};

export const verifyOtp = async (input: { data: { phone: string; code: string } }) => {
  const { phone, code } = input.data;

  if (import.meta.env.DEV) {
    const account = DEV_DEMO_ACCOUNTS[last10Digits(phone)];
    if (account) {
      if (code !== account.otp) throw new Error("Incorrect code. Please try again.");
      return { needsPin: true };
    }
    // Not one of the demo phones — fall through to the real API below.
  }

  await companyApi("/auth/register/otp/verify", {
    method: "POST",
    body: { phone: toCompanyPhone(phone), otp: code },
  });
  // The company backend only creates the account + session once PIN setup
  // completes (setPin below) — this is only ever reached from the Sign Up
  // button, so there's no "returning user" branch to handle here.
  return { needsPin: true };
};

/** Steps 4 (set PIN) + 5 (complete registration, auto-login) combined, so
 * this app's PIN-setup screen stays a single step even though the backend
 * models it as two calls. */
export const setPin = async (input: {
  data: { phone: string; pin: string; confirmPin: string; fullName?: string | undefined };
}) => {
  const { phone, pin, confirmPin, fullName } = input.data;

  if (import.meta.env.DEV && DEV_DEMO_ACCOUNTS[last10Digits(phone)]) {
    // login.tsx already checks pin === confirmPin before calling this, so
    // this branch is only reached with matching PINs — no separate demo
    // credential check needed here (unlike login/OTP, signup doesn't have a
    // "wrong" combination to reject, only a name to register). Whatever PIN
    // the user chose on this screen is accepted, same as a real signup.
    persistTokens(DEV_BYPASS_TOKEN, DEV_BYPASS_TOKEN);
    return { token: DEV_BYPASS_TOKEN, refreshToken: DEV_BYPASS_TOKEN };
  }

  await companyApi("/auth/register/pin", {
    method: "POST",
    body: { phone: toCompanyPhone(phone), pin, confirmPin },
  });

  const result = await companyApi<{
    user: { id: string; phone: string; displayName: string | null };
    accessToken: string;
    refreshToken: string;
    sessionId?: string;
  }>("/auth/register/complete", {
    method: "POST",
    body: {
      phone: toCompanyPhone(phone),
      // Backend requires some non-empty name at this step even though this
      // app collects it optionally — same placeholder convention as the
      // reference client (AUTH_FLOW.md §2 step 5).
      displayName: fullName?.trim() || PLACEHOLDER_DISPLAY_NAME,
      type: APP_TYPE,
      ...deviceFields(),
    },
  });

  persistTokens(result.accessToken, result.refreshToken, result.sessionId ?? null);
  return { token: result.accessToken, refreshToken: result.refreshToken };
};

// ─── Login (AUTH_FLOW.md §3) ─────────────────────────────────────────────

/** Throws CompanyAuthError on failure — check `.kind` ("unauthorized" | "locked"
 * | "generic"), `.attemptsRemaining`, `.lockedUntil` to reproduce the doc's
 * branching (unregistered-phone dialog / lockout screen / attempts banner). */
export const loginWithPin = async (input: { data: { phone: string; pin: string } }) => {
  const { phone, pin } = input.data;

  if (import.meta.env.DEV) {
    const account = DEV_DEMO_ACCOUNTS[last10Digits(phone)];
    if (account) {
      if (pin === account.pin) {
        persistTokens(DEV_BYPASS_TOKEN, DEV_BYPASS_TOKEN);
        return { token: DEV_BYPASS_TOKEN, refreshToken: DEV_BYPASS_TOKEN };
      }
      // Matches a demo phone but the wrong PIN — mirrors the real backend's
      // wrong-PIN response shape, attempts-remaining banner included.
      throw new CompanyAuthError("Invalid credentials. 2 attempt(s) remaining.", 401);
    }
    // Not one of the demo phones — mirrors the real backend's "phone not
    // registered" branch — same typed error login.tsx already handles (the
    // "No account found" dialog).
    throw new CompanyAuthError("unauthorized", 401);
  }

  const result = await companyApi<{
    accessToken: string;
    refreshToken: string;
    sessionId?: string;
  }>("/auth/login", {
    method: "POST",
    body: { phone: toCompanyPhone(phone), loginMethod: "pin", pin, ...deviceFields() },
  });
  persistTokens(result.accessToken, result.refreshToken, result.sessionId ?? null);
  return { token: result.accessToken, refreshToken: result.refreshToken };
};

/** Explicit refresh — the interceptor in companyApi() already does this
 * reactively on any 401, so nothing needs to call this directly today, but
 * it's kept available (e.g. for a manual "refresh now" action). */
export const refreshSession = async (input: { data: { refreshToken: string } }) => {
  const result = await companyApi<{ accessToken: string; refreshToken: string }>(
    "/auth/token/refresh",
    {
      method: "POST",
      body: { refreshToken: input.data.refreshToken },
    },
  );
  persistTokens(result.accessToken, result.refreshToken);
  return { token: result.accessToken, refreshToken: result.refreshToken };
};

// ─── Forgot PIN (AUTH_FLOW.md §4) — unauthenticated ─────────────────────

export const forgotPinInitiate = async (input: { data: { phone: string } }) => {
  await companyApi("/auth/pin/forgot/initiate", {
    method: "POST",
    body: { phone: toCompanyPhone(input.data.phone) },
  });
  return { ok: true };
};

export const forgotPinVerify = async (input: { data: { phone: string; otp: string } }) => {
  await companyApi("/auth/pin/forgot/verify", {
    method: "POST",
    body: { phone: toCompanyPhone(input.data.phone), otp: input.data.otp },
  });
  return { ok: true };
};

/** No tokens in the response, even though registration's final step returns
 * them — caller must route back through loginWithPin() afterward. */
export const forgotPinConfirm = async (input: {
  data: { phone: string; newPin: string; confirmNewPin: string };
}) => {
  await companyApi("/auth/pin/forgot/confirm", {
    method: "POST",
    body: {
      phone: toCompanyPhone(input.data.phone),
      newPin: input.data.newPin,
      confirmNewPin: input.data.confirmNewPin,
    },
  });
  return { ok: true };
};

// ─── Change PIN (AUTH_FLOW.md §5) — authenticated, token auto-attached ──

export const changePinInitiate = async (input: { data: { currentPin: string } }) => {
  await companyApi("/auth/methods/pin/change/initiate", {
    method: "POST",
    body: { currentPin: input.data.currentPin },
  });
  return { ok: true };
};

export const changePinConfirm = async (input: {
  data: { otp: string; newPin: string; confirmNewPin: string };
}) => {
  await companyApi("/auth/methods/pin/change/confirm", {
    method: "POST",
    body: {
      otp: input.data.otp,
      newPin: input.data.newPin,
      confirmNewPin: input.data.confirmNewPin,
    },
  });
  return { ok: true };
};

// ─── Profile / sign-out ──────────────────────────────────────────────────

export type PortalUser = { id: string; phone: string; full_name: string | null };

export const getMe = async (): Promise<PortalUser | null> => {
  if (!getToken()) return null;
  try {
    const me = await companyApi<{ id: string; phone: string; displayName: string | null }>(
      "/profile/me",
    );
    return { id: me.id, phone: me.phone, full_name: me.displayName ?? null };
  } catch {
    return null;
  }
};

export const signOut = async (): Promise<{ ok: true }> => {
  const refreshToken = getRefreshToken();
  if (getToken() && refreshToken) {
    // Best-effort — the user is signed out locally regardless of this call's outcome.
    await companyApi("/auth/logout", { method: "POST", body: { refreshToken } }).catch(() => {});
  }
  clearSession();
  return { ok: true };
};

// ─── Sessions (AUTH_FLOW.md §10) — authenticated ────────────────────────

export type CompanySessionInfo = {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceOs: string;
  appType: string;
  ipAddress?: string | null;
  lastActiveAt?: string | null;
  createdAt?: string | null;
};

export async function listSessions(): Promise<CompanySessionInfo[]> {
  return companyApi<CompanySessionInfo[]>("/sessions");
}

/** If this revokes our own current session, the next authenticated call
 * would just 401 anyway — clean up locally now instead of leaving the UI on
 * a session that will silently fail on its next request (AUTH_FLOW.md §10). */
export async function revokeSession(id: string): Promise<void> {
  await companyApi(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (getSessionId() === id) clearSession();
}

// ─── Linked sign-in methods (AUTH_FLOW.md §9) — authenticated ──────────

export type CompanyAuthMethod = {
  id: string;
  loginMethod: string;
  email?: string | null;
  isPrimary?: boolean;
  isActive?: boolean;
  createdAt?: string;
};

export async function listMethods(): Promise<CompanyAuthMethod[]> {
  const result = await companyApi<{ methods: CompanyAuthMethod[] }>("/auth/methods");
  return result.methods;
}

export async function unlinkMethod(id: string): Promise<void> {
  await companyApi(`/auth/methods/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Registers a new sign-in method against the already-authenticated account
 * (a link, not a login). Not called from any UI yet: Google/Apple need real
 * OAuth client wiring and biometric needs a device-linked `providerUid` from
 * a native/WebAuthn flow, neither of which exists in this project — exposed
 * for whenever that wiring is added, same as the reference app, which also
 * leaves Google/Apple *login* unwired while only linking is implemented. */
export async function linkMethod(input: {
  loginMethod: "google" | "apple" | "biometric";
  providerUid: string;
  email?: string;
}): Promise<CompanyAuthMethod> {
  const result = await companyApi<{ method: CompanyAuthMethod }>("/auth/methods", {
    method: "POST",
    body: input,
  });
  return result.method;
}
