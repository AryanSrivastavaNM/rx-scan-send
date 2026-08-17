import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Clock, MapPin, Phone, ScanLine, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getPharmacy } from "@/lib/portal-auth.functions";
import { getPharmacyCode, getToken, setPharmacyCode } from "@/lib/portal-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MedLink Pharmacy Portal — Send your prescription" },
      {
        name: "description",
        content:
          "Scan the pharmacy QR code, upload or photograph your prescription, confirm the medicines and send the order straight to the counter.",
      },
      { property: "og:title", content: "MedLink Pharmacy Portal" },
      {
        property: "og:description",
        content: "Send prescriptions to your pharmacy in seconds — upload a file or snap a photo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    p: typeof search["p"] === "string" ? (search["p"] as string) : undefined,
  }),
  component: Landing,
});

function Landing() {
  const { p } = Route.useSearch();
  const navigate = useNavigate();
  const fetchPharmacy = useServerFn(getPharmacy);

  useEffect(() => {
    if (p) setPharmacyCode(p);
  }, [p]);

  const code = p ?? (typeof window !== "undefined" ? getPharmacyCode() : null);

  const { data: pharmacy, isLoading } = useQuery({
    queryKey: ["pharmacy", code],
    queryFn: () => fetchPharmacy({ data: { code: code ?? null } }),
  });

  const start = () => {
    navigate({ to: getToken() ? "/home" : "/login" });
  };

  return (
    <main className="min-h-screen bg-background">
      <section className="brand-gradient px-5 pb-16 pt-12 text-primary-foreground">
        <div className="phone-shell">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] opacity-80">
            <ScanLine className="size-4 shrink-0" />
            Scanned at the counter
          </div>

          {pharmacy?.logo_url ? (
            <div className="mt-6 flex min-w-0 items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary-foreground/12 backdrop-blur">
                <img
                  src={pharmacy.logo_url}
                  alt={`${pharmacy.name} logo`}
                  className="size-12 rounded-xl object-cover"
                />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {isLoading ? "Loading…" : (pharmacy?.name ?? "Valli Pharmacy, Chromepet")}
                </h1>
                <p className="mt-1 line-clamp-2 text-sm opacity-80">
                  {pharmacy?.tagline ?? "Prescription service portal"}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 min-w-0">
              {/* Exact same Medic Passport branding markup as login.tsx —
                  reused verbatim, same sizing/proportions. */}
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
              <div className="mt-4 min-w-0 text-center">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {isLoading ? "Loading…" : "Valli Pharmacy, Chromepet"}
                </h1>
                <p className="mt-1 line-clamp-2 text-sm opacity-80">Prescription service portal</p>
              </div>
            </div>
          )}

          <dl className="mt-7 space-y-3 text-sm">
            {pharmacy?.address ? (
              <div className="flex gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 opacity-70" />
                <dd className="min-w-0 opacity-90">{pharmacy.address}</dd>
              </div>
            ) : null}
            {pharmacy?.phone ? (
              <div className="flex gap-3">
                <Phone className="mt-0.5 size-4 shrink-0 opacity-70" />
                <dd className="min-w-0 opacity-90">{pharmacy.phone}</dd>
              </div>
            ) : null}
            {pharmacy?.hours ? (
              <div className="flex gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 opacity-70" />
                <dd className="min-w-0 opacity-90">{pharmacy.hours}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      <section className="phone-shell -mt-8 px-5 pb-16">
        <div className="card-elevated rounded-3xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Send your prescription</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Three quick steps and the counter starts preparing your order.
          </p>

          <ol className="mt-5 space-y-4">
            {[
              { t: "Sign in with your mobile", d: "One-time code, then a 4-digit PIN for next time." },
              { t: "Add the prescription", d: "Upload a PDF or photo, or snap it with your camera." },
              { t: "Confirm the medicines", d: "We read them for you — check and send." },
            ].map((step, i) => (
              <li key={step.t} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{step.t}</p>
                  <p className="text-sm text-muted-foreground">{step.d}</p>
                </div>
              </li>
            ))}
          </ol>

          <Button className="mt-6 h-12 w-full rounded-xl text-base" onClick={start}>
            Continue
          </Button>

          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" />
            Your prescriptions stay private to you and this pharmacy.
          </p>
        </div>
      </section>
    </main>
  );
}
