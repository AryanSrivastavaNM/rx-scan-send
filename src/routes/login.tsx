import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, KeyRound, Loader2, Lock, Smartphone } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CompanyAuthError,
  forgotPinConfirm,
  forgotPinInitiate,
  forgotPinVerify,
  isValidPhone,
  loginWithPin,
  sendSignUpOtp,
  setPin,
  verifyOtp,
} from "@/lib/company-auth";
import { errorMessage, getLastPhone, setLastPhone } from "@/lib/portal-client";

// Country-code options for the phone field. Only India is wired up today, but
// this is a real Select (Radix, already a project dependency via
// src/components/ui/select.tsx) — not static text — so more countries can be
// added later by extending this list alone.
const COUNTRIES = [{ dial: "+91", flag: "🇮🇳", name: "India" }] as const;

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — medicpassport" },
      {
        name: "description",
        content:
          "Sign in with your mobile number and a 4-digit PIN to send prescriptions to your pharmacy.",
      },
      { property: "og:title", content: "Sign in — medicpassport" },
      {
        property: "og:description",
        content: "Mobile number and PIN sign-in for the pharmacy portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

// "otp"/"pin-setup" are the registration sub-flow (AUTH_FLOW.md §2); "locked"
// and "forgot-otp"/"forgot-pin-setup" are the login-side branches (§3, §4).
type Step =
  "phone" | "otp" | "pin-setup" | "pin-login" | "locked" | "forgot-otp" | "forgot-pin-setup";

function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(getLastPhone() ?? "");
  const [countryCode, setCountryCode] = useState<string>(COUNTRIES[0].dial);
  const [code, setCode] = useState("");
  const [pin, setPinValue] = useState("");
  const [pin2, setPin2] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // AUTH_FLOW.md §3's login error branches — the two dramatic ones
  // (unregistered phone, locked account) get their own dialog/screen;
  // "wrong PIN, N attempts remaining" is a banner under the keypad.
  const [unauthorizedOpen, setUnauthorizedOpen] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Sign In / Sign Up are two explicit buttons rather than one
  // auto-detecting screen, so neither one fires any API call just from
  // typing a phone number (no more /auth/register/check).
  const onSignIn = () =>
    run(async () => {
      if (!isValidPhone(phone)) throw new Error("Enter a valid mobile number");
      setLastPhone(phone);
      setStep("pin-login");
    });

  const onSignUp = () =>
    run(async () => {
      await sendSignUpOtp({ data: { phone } });
      setLastPhone(phone);
      setStep("otp");
      toast.success("Verification code sent");
    });

  const onOtp = () =>
    run(async () => {
      const res = await verifyOtp({ data: { phone, code } });
      // The company backend doesn't issue a session until PIN setup completes
      // (see setPin below) — it never returns a token here.
      if (res.needsPin) {
        setStep("pin-setup");
      } else {
        navigate({ to: "/home" });
      }
    });

  const onPinSetup = () =>
    run(async () => {
      if (pin !== pin2) throw new Error("The two PINs do not match");
      // setPin both sets the PIN and completes registration server-side
      // (persisting the resulting session itself), so this is where the
      // user actually becomes signed in.
      await setPin({ data: { phone, pin, confirmPin: pin2, fullName: name || undefined } });
      toast.success("PIN created");
      navigate({ to: "/home" });
    });

  const onPinLogin = () =>
    run(async () => {
      try {
        await loginWithPin({ data: { phone, pin } });
      } catch (e) {
        if (e instanceof CompanyAuthError) {
          if (e.kind === "unauthorized") {
            setUnauthorizedOpen(true);
            return;
          }
          if (e.kind === "locked") {
            setLockedUntil(e.lockedUntil);
            setLockedMessage(e.message);
            setStep("locked");
            return;
          }
          setAttemptsRemaining(e.attemptsRemaining);
        }
        throw e;
      }
      setAttemptsRemaining(null);
      navigate({ to: "/home" });
    });

  // Shared entry point for the forgot-PIN flow (AUTH_FLOW.md §4) — reachable
  // both from the PIN-login screen's link and from the locked-account
  // screen's "Reset PIN now" button, since forgot-PIN works even while
  // locked (it doesn't check the lock flag server-side either).
  const onForgotPinStart = () =>
    run(async () => {
      await forgotPinInitiate({ data: { phone } });
      setStep("forgot-otp");
      toast.success("Verification code sent");
    });

  const onForgotOtp = () =>
    run(async () => {
      await forgotPinVerify({ data: { phone, otp: code } });
      setStep("forgot-pin-setup");
    });

  const onForgotPinSetup = () =>
    run(async () => {
      if (pin !== pin2) throw new Error("The two PINs do not match");
      // No tokens in this response (unlike registration's last step) — the
      // PIN is reset server-side only; the user signs in for real next.
      await forgotPinConfirm({ data: { phone, newPin: pin, confirmNewPin: pin2 } });
      toast.success("PIN reset. Please sign in with your new PIN.");
      setPinValue("");
      setPin2("");
      setAttemptsRemaining(null);
      setStep("pin-login");
    });

  const back = () => {
    setCode("");
    setPinValue("");
    setPin2("");
    if (step === "forgot-otp" || step === "forgot-pin-setup" || step === "locked") {
      // These are sub-steps of PIN login, not registration — go back one
      // level rather than all the way to phone entry.
      setAttemptsRemaining(null);
      setStep("pin-login");
      return;
    }
    setAttemptsRemaining(null);
    setStep("phone");
  };

  // Display-only split of the `phone` state into the selected country code +
  // local digits. `phone` itself (the value sent to sendSignUpOtp/verifyOtp/loginWithPin)
  // is unchanged — still a single string; only how the UI composes it changed.
  const selectedCountry = COUNTRIES.find((c) => c.dial === countryCode) ?? COUNTRIES[0];
  const phoneDigits = phone.startsWith(countryCode) ? phone.slice(countryCode.length) : phone;

  const onCountryChange = (dial: string) => {
    setCountryCode(dial);
    setPhone(phoneDigits ? `${dial}${phoneDigits}` : "");
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-5 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,var(--brand-blue-soft)_0%,transparent_100%)]"
      />

      <div className="relative mx-auto w-full max-w-105">
        {step !== "phone" ? (
          <button
            onClick={back}
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-(--brand-blue)"
          >
            <ArrowLeft className="size-4" />
            Change number
          </button>
        ) : (
          <button
            onClick={() => navigate({ to: "/", search: { p: undefined } })}
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-(--brand-blue)"
          >
            <ArrowLeft className="size-4" />
            Back
          </button>
        )}

        <div className="flex flex-col items-center text-center">
          <img
            src="/logo.png"
            alt="Medic Passport logo"
            width={56}
            height={56}
            className="size-14 rounded-2xl shadow-[0_12px_24px_-10px_rgba(41,83,232,0.5)]"
          />
          <p className="mt-2.5 text-lg font-semibold tracking-tight">
            <span className="text-foreground">medic</span>
            <span className="text-(--brand-blue)">passport</span>
          </p>
        </div>

        {/* Step icon + heading + subtitle — shared across all steps so the
            screen stays a single compact, card-free flow instead of a boxed form. */}
        <div className="mt-8 flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-(--brand-blue-soft) text-(--brand-blue)">
            {step === "phone" || step === "otp" || step === "forgot-otp" ? (
              <Smartphone className="size-6" />
            ) : step === "locked" ? (
              <Lock className="size-6" />
            ) : (
              <KeyRound className="size-6" />
            )}
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
            {step === "phone" && "Enter your phone number"}
            {(step === "otp" || step === "forgot-otp") && "Enter the 4-digit code"}
            {step === "pin-setup" && "Create a 4-digit PIN"}
            {step === "pin-login" && "Enter your PIN"}
            {step === "locked" && "Account temporarily locked"}
            {step === "forgot-pin-setup" && "Create a new PIN"}
          </h1>
          <p className="mt-1.5 max-w-[16rem] text-sm text-muted-foreground">
            {step === "phone" && "Sign in with your PIN, or sign up to get one."}
            {(step === "otp" || step === "forgot-otp") && `Sent to ${phone}`}
            {step === "pin-setup" && "Use it to sign in quickly next time you scan the QR code."}
            {step === "pin-login" && `Signing in as ${phone}`}
            {step === "forgot-pin-setup" && "Choose a new 4-digit PIN for next time."}
          </p>
        </div>

        <div className="mt-6 space-y-5">
          {step === "phone" && (
            <>
              <div className="flex h-12 items-stretch overflow-hidden rounded-xl border border-border bg-background transition-colors focus-within:border-(--brand-blue) focus-within:ring-1 focus-within:ring-(--brand-blue)">
                <Select value={countryCode} onValueChange={onCountryChange}>
                  <SelectTrigger
                    aria-label="Country code"
                    className="h-full w-auto shrink-0 gap-1 rounded-none border-0 border-r border-border bg-secondary/50 px-3 text-sm font-medium text-foreground shadow-none focus:ring-0"
                  >
                    <SelectValue>
                      <span aria-hidden="true">{selectedCountry.flag}</span> {selectedCountry.dial}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.dial} value={c.dial}>
                        <span aria-hidden="true" className="mr-1.5">
                          {c.flag}
                        </span>
                        {c.dial} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="phone"
                  aria-label="Mobile number"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={10}
                  placeholder="98765 43210"
                  value={phoneDigits}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setPhone(digits ? `${countryCode}${digits}` : "");
                  }}
                  className="h-full flex-1 rounded-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-12 w-full rounded-xl text-base"
                  onClick={onSignIn}
                  disabled={busy || !phone}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
                </Button>
                <Button
                  className="h-12 w-full rounded-xl bg-(--brand-blue) text-base text-white shadow-[0_10px_20px_-10px_rgba(41,83,232,0.6)] hover:bg-(--brand-blue-dark)"
                  onClick={onSignUp}
                  disabled={busy || !phone}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign up"}
                </Button>
              </div>
            </>
          )}

          {step === "otp" && (
            <>
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="h-14 rounded-xl text-center text-2xl tracking-[0.5em] focus-visible:border-(--brand-blue) focus-visible:ring-(--brand-blue)"
              />
              <Button
                className="h-12 w-full rounded-xl bg-(--brand-blue) text-base text-white shadow-[0_10px_20px_-10px_rgba(41,83,232,0.6)] hover:bg-(--brand-blue-dark)"
                onClick={onOtp}
                disabled={busy || code.length !== 4}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Verify"}
              </Button>
            </>
          )}

          {step === "pin-setup" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name (optional)</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Priya Sharma"
                  className="h-12 rounded-xl text-base focus-visible:border-(--brand-blue) focus-visible:ring-(--brand-blue)"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pin">New PIN</Label>
                <Input
                  id="pin"
                  inputMode="numeric"
                  maxLength={4}
                  type="password"
                  value={pin}
                  onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                  className="h-14 rounded-xl text-center text-2xl tracking-[0.6em] focus-visible:border-(--brand-blue) focus-visible:ring-(--brand-blue)"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pin2">Confirm PIN</Label>
                <Input
                  id="pin2"
                  inputMode="numeric"
                  maxLength={4}
                  type="password"
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                  className="h-14 rounded-xl text-center text-2xl tracking-[0.6em] focus-visible:border-(--brand-blue) focus-visible:ring-(--brand-blue)"
                />
              </div>
              <Button
                className="h-12 w-full rounded-xl bg-(--brand-blue) text-base text-white shadow-[0_10px_20px_-10px_rgba(41,83,232,0.6)] hover:bg-(--brand-blue-dark)"
                onClick={onPinSetup}
                disabled={busy || pin.length !== 4 || pin2.length !== 4}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Save PIN and continue"}
              </Button>
            </>
          )}

          {step === "pin-login" && (
            <>
              <Input
                inputMode="numeric"
                maxLength={4}
                type="password"
                value={pin}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                className="h-14 rounded-xl text-center text-2xl tracking-[0.6em] focus-visible:border-(--brand-blue) focus-visible:ring-(--brand-blue)"
              />
              {attemptsRemaining !== null && attemptsRemaining <= 2 && (
                <button
                  onClick={onForgotPinStart}
                  disabled={busy}
                  className="w-full rounded-xl border-l-4 border-destructive bg-destructive/10 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-destructive/15"
                >
                  {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} left. Reset your
                  PIN instead?
                </button>
              )}
              <Button
                className="h-12 w-full rounded-xl bg-(--brand-blue) text-base text-white shadow-[0_10px_20px_-10px_rgba(41,83,232,0.6)] hover:bg-(--brand-blue-dark)"
                onClick={onPinLogin}
                disabled={busy || pin.length !== 4}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
              </Button>
              <button
                className="w-full text-sm text-muted-foreground underline-offset-4 hover:text-(--brand-blue) hover:underline"
                onClick={onForgotPinStart}
              >
                Forgot PIN? Verify by code instead
              </button>
            </>
          )}

          {step === "locked" && (
            <>
              <p className="rounded-xl border-l-4 border-destructive bg-destructive/10 px-4 py-3 text-sm text-foreground">
                Too many incorrect PIN attempts.{" "}
                {lockedUntil
                  ? `You can try again after ${lockedUntil.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}, `
                  : lockedMessage
                    ? `${lockedMessage} `
                    : "You can try again in about 30 minutes, "}
                or reset your PIN to get back in right away.
              </p>
              <Button
                className="h-12 w-full rounded-xl bg-(--brand-blue) text-base text-white shadow-[0_10px_20px_-10px_rgba(41,83,232,0.6)] hover:bg-(--brand-blue-dark)"
                onClick={onForgotPinStart}
                disabled={busy}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Reset PIN now"}
              </Button>
            </>
          )}

          {step === "forgot-otp" && (
            <>
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="h-14 rounded-xl text-center text-2xl tracking-[0.5em] focus-visible:border-(--brand-blue) focus-visible:ring-(--brand-blue)"
              />
              <Button
                className="h-12 w-full rounded-xl bg-(--brand-blue) text-base text-white shadow-[0_10px_20px_-10px_rgba(41,83,232,0.6)] hover:bg-(--brand-blue-dark)"
                onClick={onForgotOtp}
                disabled={busy || code.length !== 4}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Verify"}
              </Button>
            </>
          )}

          {step === "forgot-pin-setup" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="new-pin">New PIN</Label>
                <Input
                  id="new-pin"
                  inputMode="numeric"
                  maxLength={4}
                  type="password"
                  value={pin}
                  onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                  className="h-14 rounded-xl text-center text-2xl tracking-[0.6em] focus-visible:border-(--brand-blue) focus-visible:ring-(--brand-blue)"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-pin2">Confirm new PIN</Label>
                <Input
                  id="new-pin2"
                  inputMode="numeric"
                  maxLength={4}
                  type="password"
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                  className="h-14 rounded-xl text-center text-2xl tracking-[0.6em] focus-visible:border-(--brand-blue) focus-visible:ring-(--brand-blue)"
                />
              </div>
              <Button
                className="h-12 w-full rounded-xl bg-(--brand-blue) text-base text-white shadow-[0_10px_20px_-10px_rgba(41,83,232,0.6)] hover:bg-(--brand-blue-dark)"
                onClick={onForgotPinSetup}
                disabled={busy || pin.length !== 4 || pin2.length !== 4}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Save new PIN"}
              </Button>
            </>
          )}
        </div>
      </div>

      <AlertDialog open={unauthorizedOpen} onOpenChange={setUnauthorizedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No account found</AlertDialogTitle>
            <AlertDialogDescription>
              We couldn't find an account for {phone}. Would you like to create one?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPhone("");
                setStep("phone");
              }}
            >
              Try a different number
            </AlertDialogCancel>
            <AlertDialogAction onClick={onSignUp}>Create account</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
