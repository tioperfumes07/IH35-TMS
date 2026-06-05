import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PwaButton } from "./PwaButton";

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "driver_pwa_install_dismissed_at";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function shouldShow(): boolean {
  const value = Number(localStorage.getItem(DISMISS_KEY) || "0");
  if (!value) return true;
  return Date.now() - value > DISMISS_MS;
}

export function InstallPrompt() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => !shouldShow());
  const isiOS = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window as Window & { MSStream?: unknown }).MSStream,
    []
  );

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredPrompt);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (dismissed || (!deferredPrompt && !isiOS)) return null;

  return (
    <div className="fixed bottom-3 left-4 right-4 z-30 rounded-xl border border-pwa-border bg-pwa-card p-3 shadow-lg">
      <p className="text-sm font-medium text-pwa-text-primary">{t("install.title")}</p>
      <p className="mt-1 text-xs text-pwa-text-secondary">{isiOS ? t("install.ios_hint") : t("install.default_hint")}</p>
      <div className="mt-3 flex gap-2">
        {!isiOS ? (
          <PwaButton
            className="flex-1"
            onClick={async () => {
              if (!deferredPrompt) return;
              await deferredPrompt.prompt();
              await deferredPrompt.userChoice;
              setDeferredPrompt(null);
              setDismissed(true);
            }}
          >
            {t("common.install")}
          </PwaButton>
        ) : null}
        <PwaButton
          variant="ghost"
          className={isiOS ? "flex-1" : ""}
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
            setDismissed(true);
          }}
        >
          {t("common.dismiss")}
        </PwaButton>
      </div>
    </div>
  );
}
