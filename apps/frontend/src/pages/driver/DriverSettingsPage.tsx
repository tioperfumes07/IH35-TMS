import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { readVapidPublicKeyFromEnv, registerDriverWebPush } from "../../lib/push-permission";
import { useState } from "react";
import { patchDriverOnboarding } from "../../api/driver";

export function DriverSettingsPage() {
  const { t } = useTranslation();
  const [note, setNote] = useState<string | null>(null);
  const [pushPending, setPushPending] = useState(false);
  const qc = useQueryClient();

  const restartTour = useMutation({
    mutationFn: () => patchDriverOnboarding({ complete: false }),
    onSuccess: async () => {
      setNote("Tour will show again after you refresh.");
      await qc.invalidateQueries({ queryKey: ["driver", "me"] });
    },
    onError: () => setNote("Could not restart tour."),
  });

  const enablePush = async () => {
    const vapid = readVapidPublicKeyFromEnv();
    if (!vapid) {
      setNote("Push not configured (missing VITE_VAPID_PUBLIC_KEY).");
      return;
    }
    setPushPending(true);
    try {
      const res = await registerDriverWebPush(vapid);
      setNote(res.ok ? "Push enabled." : `Push skipped: ${res.reason ?? "unknown"}`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not enable push notifications.");
    } finally {
      setPushPending(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <h2 className="text-base font-semibold">{t("driver.settings_title")}</h2>
      <p className="text-xs text-slate-600">Use the header to switch {t("driver.language")} (EN/ES).</p>
      <button type="button" className="rounded-sm bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={pushPending} onClick={() => void enablePush()}>
        {pushPending ? "Enabling…" : t("driver.push_enable")}
      </button>
      <button
        type="button"
        className="rounded-sm border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800"
        onClick={() => void restartTour.mutate()}
      >
        Restart guided tour
      </button>
      {note ? <p role="status" className="text-xs text-slate-600">{note}</p> : null}
    </div>
  );
}
