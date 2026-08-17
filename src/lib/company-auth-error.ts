// Split out of company-auth.client.ts: this class has no browser dependency,
// but living in a `.client.ts`-suffixed file meant any import of it — even
// just for `instanceof` checks — was denied by Start's import protection for
// files reachable from the server bundle (i.e. any route file). Kept here so
// route files can import it directly without going through the
// createClientOnlyFn boundary in company-auth.ts.

/** Typed error so callers can branch the way AUTH_FLOW.md §3 describes,
 * instead of string-matching `.message` themselves at every call site. */
export class CompanyAuthError extends Error {
  readonly status: number;
  readonly kind: "unauthorized" | "locked" | "generic";
  /** Parsed from "Invalid credentials. N attempt(s) remaining." — null otherwise. */
  readonly attemptsRemaining: number | null;
  /** Parsed from a "...locked until <ISO timestamp>." message, when present. */
  readonly lockedUntil: Date | null;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CompanyAuthError";
    this.status = status;
    if (message === "unauthorized") {
      this.kind = "unauthorized";
      this.attemptsRemaining = null;
      this.lockedUntil = null;
    } else if (message.toLowerCase().includes("locked")) {
      this.kind = "locked";
      this.attemptsRemaining = null;
      const iso = message.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/);
      this.lockedUntil = iso ? new Date(iso[0]) : null;
    } else {
      this.kind = "generic";
      const attempts = message.match(/(\d+)\s+attempt/i);
      this.attemptsRemaining = attempts ? Number(attempts[1]) : null;
      this.lockedUntil = null;
    }
  }
}
