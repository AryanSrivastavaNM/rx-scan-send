import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Laptop, Loader2, Shield, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type CompanyAuthMethod,
  type CompanySessionInfo,
  changePinConfirm,
  changePinInitiate,
  listMethods,
  listSessions,
  revokeSession,
  unlinkMethod,
} from "@/lib/company-auth";
import { errorMessage, getSessionId, getToken } from "@/lib/portal-client";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [{ title: "Security — medicpassport" }],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      navigate({ to: "/login" });
      return;
    }
    setReady(true);
  }, [navigate]);

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto w-full max-w-105">
        <button
          onClick={() => navigate({ to: "/home" })}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-(--brand-blue)"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        <div className="flex items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-(--brand-blue-soft) text-(--brand-blue)">
            <Shield className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Security</h1>
            <p className="text-sm text-muted-foreground">PIN, devices and sign-in methods</p>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          <ChangePinSection />
          <SessionsSection />
          <MethodsSection />
        </div>
      </div>
    </main>
  );
}

// ─── Change PIN (AUTH_FLOW.md §5) ───────────────────────────────────────

function ChangePinSection() {
  const [phase, setPhase] = useState<"current-pin" | "confirm">("current-pin");
  const [currentPin, setCurrentPin] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPhase("current-pin");
    setCurrentPin("");
    setOtp("");
    setNewPin("");
    setNewPin2("");
  };

  const onInitiate = async () => {
    setBusy(true);
    try {
      await changePinInitiate({ data: { currentPin } });
      toast.success("Verification code sent to your phone");
      setPhase("confirm");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (newPin !== newPin2) {
      toast.error("The two PINs do not match");
      return;
    }
    setBusy(true);
    try {
      await changePinConfirm({ data: { otp, newPin, confirmNewPin: newPin2 } });
      toast.success("PIN changed");
      reset();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <KeyRound className="size-4 shrink-0" />
        Change PIN
      </h2>
      <div className="card-elevated space-y-3 rounded-2xl border border-border bg-card p-4">
        {phase === "current-pin" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="current-pin">Current PIN</Label>
              <Input
                id="current-pin"
                inputMode="numeric"
                maxLength={4}
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                className="h-12 rounded-xl text-center text-lg tracking-[0.5em]"
              />
            </div>
            <Button
              className="h-11 w-full rounded-xl"
              onClick={onInitiate}
              disabled={busy || currentPin.length !== 4}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Send verification code"}
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="change-pin-otp">Verification code</Label>
              <Input
                id="change-pin-otp"
                inputMode="numeric"
                maxLength={4}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="h-12 rounded-xl text-center text-lg tracking-[0.5em]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pin">New PIN</Label>
              <Input
                id="new-pin"
                inputMode="numeric"
                maxLength={4}
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                className="h-12 rounded-xl text-center text-lg tracking-[0.5em]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pin-2">Confirm new PIN</Label>
              <Input
                id="new-pin-2"
                inputMode="numeric"
                maxLength={4}
                type="password"
                value={newPin2}
                onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, ""))}
                className="h-12 rounded-xl text-center text-lg tracking-[0.5em]"
              />
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <Button variant="ghost" className="rounded-xl" onClick={reset} disabled={busy}>
                Cancel
              </Button>
              <Button
                className="h-11 rounded-xl"
                onClick={onConfirm}
                disabled={busy || otp.length !== 4 || newPin.length !== 4 || newPin2.length !== 4}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Change PIN"}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ─── Sessions (AUTH_FLOW.md §10) ─────────────────────────────────────────

function SessionsSection() {
  const navigate = useNavigate();
  const {
    data: sessions,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => listSessions(),
  });
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const currentSessionId = getSessionId();

  const onRevoke = async (session: CompanySessionInfo) => {
    if (!window.confirm(`Sign out "${session.deviceName}"? This can't be undone.`)) return;
    setRevokingId(session.id);
    try {
      await revokeSession(session.id);
      if (session.id === currentSessionId) {
        toast.message("Signed out of this device");
        navigate({ to: "/login" });
        return;
      }
      toast.success("Device signed out");
      await refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Laptop className="size-4 shrink-0" />
        Signed-in devices
      </h2>
      {isLoading ? (
        <div className="card-elevated flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <Loader2 className="size-5 shrink-0 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Loading devices…</p>
        </div>
      ) : sessions && sessions.length ? (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id} className="card-elevated rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.deviceName}
                      {s.id === currentSessionId ? (
                        <span className="ml-2 rounded-full bg-(--brand-blue-soft) px-2 py-0.5 text-xs font-medium text-(--brand-blue)">
                          This device
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.deviceOs}
                      {s.lastActiveAt
                        ? ` · Active ${new Date(s.lastActiveAt).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                </div>
                <button
                  aria-label={`Sign out ${s.deviceName}`}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  onClick={() => onRevoke(s)}
                  disabled={revokingId === s.id}
                >
                  {revokingId === s.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No active devices found.
        </p>
      )}
    </section>
  );
}

// ─── Linked sign-in methods (AUTH_FLOW.md §9) ────────────────────────────

function MethodsSection() {
  const {
    data: methods,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["methods"],
    queryFn: () => listMethods(),
  });
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const onUnlink = async (method: CompanyAuthMethod) => {
    if (!window.confirm(`Remove ${method.loginMethod} as a sign-in method?`)) return;
    setUnlinkingId(method.id);
    try {
      await unlinkMethod(method.id);
      toast.success("Sign-in method removed");
      await refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <KeyRound className="size-4 shrink-0" />
        Linked sign-in methods
      </h2>
      {isLoading ? (
        <div className="card-elevated flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <Loader2 className="size-5 shrink-0 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : methods && methods.length ? (
        <ul className="space-y-3">
          {methods.map((m) => {
            // Removing your only/primary method would lock you out — this
            // app also has no Google/Apple/biometric *linking* UI yet
            // (AUTH_FLOW.md §9's own reference client leaves those unwired
            // too), so PIN/primary methods aren't offered for removal here.
            const removable = !m.isPrimary && m.loginMethod !== "pin";
            return (
              <li key={m.id} className="card-elevated rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium capitalize">
                      {m.loginMethod}
                      {m.isPrimary ? (
                        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                          Primary
                        </span>
                      ) : null}
                    </p>
                    {m.email ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.email}</p>
                    ) : null}
                  </div>
                  {removable ? (
                    <button
                      aria-label={`Remove ${m.loginMethod}`}
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      onClick={() => onUnlink(m)}
                      disabled={unlinkingId === m.id}
                    >
                      {unlinkingId === m.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No linked methods yet.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Google, Apple and biometric sign-in aren't available on the web portal yet.
      </p>
    </section>
  );
}
