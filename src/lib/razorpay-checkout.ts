type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

async function loadRazorpay() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load the payment page")));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment page"));
    document.body.appendChild(script);
  });
}

/** Opens the Razorpay checkout and resolves with the payment result (null if dismissed).
 *
 * NETWORK CALL DISABLED — never loads the real checkout.js script or opens
 * the real payment modal; resolves immediately with a fake successful
 * payment instead. Real implementation commented out below. */
export async function openRazorpayCheckout(options: {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefillContact?: string;
  prefillName?: string;
}): Promise<RazorpayResponse | null> {
  return {
    razorpay_order_id: options.orderId,
    razorpay_payment_id: `mock_pay_${Date.now()}`,
    razorpay_signature: "mock-signature",
  };

  // await loadRazorpay();
  // if (!window.Razorpay) throw new Error("Could not load the payment page");
  //
  // return new Promise((resolve, reject) => {
  //   try {
  //     const rzp = new window.Razorpay!({
  //       key: options.keyId,
  //       order_id: options.orderId,
  //       amount: options.amount,
  //       currency: options.currency,
  //       name: options.name,
  //       description: options.description,
  //       prefill: { contact: options.prefillContact ?? "", name: options.prefillName ?? "" },
  //       theme: { color: "#1D7DD6" },
  //       handler: (response: RazorpayResponse) => resolve(response),
  //       modal: { ondismiss: () => resolve(null) },
  //     });
  //     rzp.open();
  //   } catch (e) {
  //     reject(e instanceof Error ? e : new Error("Payment could not be started"));
  //   }
  // });
}
