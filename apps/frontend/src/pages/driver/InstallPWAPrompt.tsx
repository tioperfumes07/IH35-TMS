import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  return iOS && webkit && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function InstallPWAPrompt() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const show = useMemo(() => {
    if (typeof window === "undefined") return false;
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone) return false;
    return isIosSafari();
  }, []);

  if (!show) return null;

  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="flex items-start justify-between gap-2">
        <p>{t("driver.install_prompt")}</p>
        <button type="button" className="shrink-0 rounded border border-amber-300 px-2 py-0.5 text-[11px] font-semibold" onClick={() => setOpen(!open)}>
          {t("driver.install_button")}
        </button>
      </div>
      {open ? (
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px]">
          <li>Tap the Share button in Safari.</li>
          <li>Choose &quot;Add to Home Screen&quot;.</li>
          <li>Open IH35 from the home screen icon.</li>
        </ol>
      ) : null}
    </div>
  );
}
