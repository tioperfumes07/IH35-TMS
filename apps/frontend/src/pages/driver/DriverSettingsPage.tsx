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
    <div className="space-y-3 text-xs">
      <h2 className="text-xs font-semibold">{t("driver.settings_title")}</h2>
      <p className="text-xs text-[#4B5563]">Use the header to switch {t("driver.language")} (EN/ES).</p>
      <button type="button" className="rounded-sm bg-[#0F1219] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={pushPending} onClick={() => void enablePush()}>
        {pushPending ? "Enabling…" : t("driver.push_enable")}
      </button>
      <button
        type="button"
        className="rounded-sm border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#0F1219]"
        onClick={() => void restartTour.mutate()}
      >
        Restart guided tour
      </button>
      {note ? <p role="status" className="text-xs text-[#4B5563]">{note}</p> : null}
    </div>
  );
}
