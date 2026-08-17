import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "mp_install_dismissed";

/** Offers to add a "MedicPassport" shortcut to the phone's home screen / browser. */
export function InstallShortcut() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIos) {
      setIosHint(true);
      setVisible(true);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setIosHint(false);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);
    // Browsers that never fire the install event still get manual instructions.
    const fallback = window.setTimeout(() => setVisible(true), 2500);
    return () => {
      window.clearTimeout(fallback);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);


  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="card-elevated relative rounded-2xl border border-border bg-card p-4">
      <button
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg text-muted-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <img src="/icon-192.png" alt="MedicPassport icon" width={40} height={40} className="size-10 rounded-xl" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Add MedicPassport shortcut</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {iosHint
              ? "Tap the Share button, then “Add to Home Screen” to reopen this portal anytime."
              : "Keep a one-tap shortcut on your phone so you can reopen the portal without the QR code."}
          </p>
        </div>
      </div>
      {deferred ? (
        <Button
          className="mt-3 h-11 w-full rounded-xl"
          onClick={async () => {
            await deferred.prompt();
            const choice = await deferred.userChoice;
            setDeferred(null);
            if (choice.outcome === "accepted") setVisible(false);
          }}
        >
          <Download className="size-4" />
          Add shortcut
        </Button>
      ) : (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          <Share className="size-4 shrink-0" />
          {iosHint ? "Share → Add to Home Screen" : "Browser menu → Add to Home screen"}
        </p>
      )}

    </div>
  );
}
