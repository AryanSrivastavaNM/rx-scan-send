// Device identity for the SpotCare authService — see AUTH_FLOW.md §2/§3.
// The reference (mobile) client mints a stable per-install device id and
// reuses it on every register/login call so the backend's session table
// scopes sessions per physical device rather than per account; the closest
// web equivalent is a random id persisted in localStorage, which survives
// logout/re-login (and different accounts signing in on the same browser)
// but not "clear site data" — same trust boundary as the app being
// reinstalled on mobile.

const DEVICE_ID_KEY = "rx_portal_device_id";

/** appType / type discriminator this app sends on every call that accepts
 * it (AUTH_FLOW.md's doctor build sends "doctor"; this is the patient
 * portal, so "patient" throughout). */
export const APP_TYPE = "patient" as const;

/** Sent as displayName's fallback when the user didn't type a name during
 * PIN setup — the backend requires some non-empty name at that step (see
 * AUTH_FLOW.md §2 step 5). Mirrors the reference client's placeholder
 * convention ("New Doctor" there); the real name is still collected
 * optionally up front on this app's PIN-setup screen, unlike the mobile
 * client which always defers it to a later profile screen. */
export const PLACEHOLDER_DISPLAY_NAME = "New Patient";

export const DEVICE_NAME = "medicpassport Patient Portal";

function detectDeviceOs(): string {
  if (typeof navigator === "undefined") return "Web";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/mac os/i.test(ua)) return "macOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/linux/i.test(ua)) return "Linux";
  return "Web";
}

export const DEVICE_OS = detectDeviceOs();

function randomBase36(len: number): string {
  let out = "";
  while (out.length < len) out += Math.random().toString(36).slice(2);
  return out.slice(0, len);
}

/** Stable per-browser id, minted once and never cleared on logout (see
 * AUTH_FLOW.md §13, "device id is stable per install, not per login/logout
 * cycle"). Returns "" during SSR (no localStorage) — callers only need a
 * real value for client-initiated network calls. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `patient-web-${Date.now()}-${randomBase36(8)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
