// Facade over company-auth.client.ts's browser-only API. Route files
// (login.tsx, home.tsx, security.tsx) are bundled into BOTH the client and
// server environments for SSR, so a direct import of a `.client.ts`-suffixed
// file from them is denied by Start's import protection — see
// company-auth.client.ts's own header comment for why it's client-only.
//
// Every function below is wrapped in createClientOnlyFn, which the Start
// compiler recognizes as a safe boundary: on the client it's compiled away
// to a direct reference to the real implementation; on the server it's
// replaced with a stub that throws if ever called. All call sites for these
// (event handlers, useEffect, and gated useQuery queryFns — never render or
// a loader) already never invoke them during SSR, so this changes nothing
// about behavior, only where the import-protection boundary sits.
import { createClientOnlyFn } from "@tanstack/react-start";
import {
  changePinConfirm as changePinConfirmImpl,
  changePinInitiate as changePinInitiateImpl,
  forgotPinConfirm as forgotPinConfirmImpl,
  forgotPinInitiate as forgotPinInitiateImpl,
  forgotPinVerify as forgotPinVerifyImpl,
  getMe as getMeImpl,
  isValidPhone as isValidPhoneImpl,
  listMethods as listMethodsImpl,
  listSessions as listSessionsImpl,
  loginWithPin as loginWithPinImpl,
  restoreSession as restoreSessionImpl,
  revokeSession as revokeSessionImpl,
  sendSignUpOtp as sendSignUpOtpImpl,
  setPin as setPinImpl,
  signOut as signOutImpl,
  unlinkMethod as unlinkMethodImpl,
  verifyOtp as verifyOtpImpl,
} from "./company-auth.client";

export const isValidPhone = createClientOnlyFn(isValidPhoneImpl);
export const sendSignUpOtp = createClientOnlyFn(sendSignUpOtpImpl);
export const verifyOtp = createClientOnlyFn(verifyOtpImpl);
export const setPin = createClientOnlyFn(setPinImpl);
export const loginWithPin = createClientOnlyFn(loginWithPinImpl);
export const forgotPinInitiate = createClientOnlyFn(forgotPinInitiateImpl);
export const forgotPinVerify = createClientOnlyFn(forgotPinVerifyImpl);
export const forgotPinConfirm = createClientOnlyFn(forgotPinConfirmImpl);
export const restoreSession = createClientOnlyFn(restoreSessionImpl);
export const getMe = createClientOnlyFn(getMeImpl);
export const signOut = createClientOnlyFn(signOutImpl);
export const changePinInitiate = createClientOnlyFn(changePinInitiateImpl);
export const changePinConfirm = createClientOnlyFn(changePinConfirmImpl);
export const listMethods = createClientOnlyFn(listMethodsImpl);
export const listSessions = createClientOnlyFn(listSessionsImpl);
export const revokeSession = createClientOnlyFn(revokeSessionImpl);
export const unlinkMethod = createClientOnlyFn(unlinkMethodImpl);

export type { CompanyAuthMethod, CompanySessionInfo, PortalUser } from "./company-auth.client";
export { CompanyAuthError } from "./company-auth-error";
