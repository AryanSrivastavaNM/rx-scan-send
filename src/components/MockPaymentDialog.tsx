import { Loader2, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MockPaymentOrder = {
  id: string;
  quoted_amount: number | string | null;
  currency: string | null;
  prescription_items: { name: string; quantity?: string | null }[];
};

const money = (order: MockPaymentOrder) => {
  const symbol = (order.currency ?? "INR") === "INR" ? "₹" : `${order.currency ?? ""} `;
  return `${symbol}${Number(order.quoted_amount ?? 0).toFixed(2)}`;
};

/** Stands in for the real Razorpay checkout modal (see razorpay-checkout.ts
 * — its openRazorpayCheckout() is mocked to resolve instantly with no UI at
 * all, which left "Pay now" with no visible flow). This gives the mock
 * payment an actual confirmation step — order summary, amount, an explicit
 * "Pay" action with a brief simulated processing state — instead of an
 * invisible background call. */
export function MockPaymentDialog({
  open,
  onOpenChange,
  order,
  pharmacyName,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: MockPaymentOrder | null;
  pharmacyName: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open && Boolean(order)} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-[92vw] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4 shrink-0 text-(--brand-blue)" />
            Confirm payment
          </DialogTitle>
          <DialogDescription className="text-xs">Paying {pharmacyName}</DialogDescription>
        </DialogHeader>

        {order ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Order summary
              </p>
              <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                {order.prescription_items.length ? (
                  order.prescription_items.map((m, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-2.5 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium">{m.name}</span>
                      {m.quantity ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Qty {m.quantity}
                        </span>
                      ) : null}
                    </li>
                  ))
                ) : (
                  <li className="rounded-lg border border-border px-2.5 py-2 text-sm text-muted-foreground">
                    Prescription order
                  </li>
                )}
              </ul>
            </div>

            <div className="space-y-1.5 rounded-xl bg-secondary/70 p-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Order total</span>
                <span>{money(order)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Delivery</span>
                <span>Free</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold text-foreground">
                <span>Amount to pay</span>
                <span>{money(order)}</span>
              </div>
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0" />
              Demo checkout — no real payment is made or charged.
            </p>

            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
              <Button
                variant="ghost"
                className="rounded-xl"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button className="h-12 rounded-xl text-base" onClick={onConfirm} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>Pay {money(order)}</>
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
