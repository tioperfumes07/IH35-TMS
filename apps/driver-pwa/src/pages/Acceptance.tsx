import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { acceptLoad, getLoadDetail } from "../api/loads";
import { SignaturePad } from "../components/SignaturePad";
import { PwaButton } from "../components/PwaButton";
import { useGeofence } from "../lib/geofence";
import { useToast } from "../components/Toast";

export function AcceptancePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const loadQuery = useQuery({ queryKey: ["pwa", "loads", "detail", id], queryFn: () => getLoadDetail(id), enabled: Boolean(id) });
  const load = loadQuery.data;
  const pickupStop = useMemo(() => load?.stops[0] ?? null, [load]);
  const geofence = useGeofence(pickupStop?.lat ?? 0, pickupStop?.lng ?? 0, 25);
  const geofenceOk = geofence.status === "ok" && geofence.inside;
  const canSubmit = scrolledToBottom && Boolean(signatureDataUrl) && geofenceOk;

  if (!load) {
    return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("common.loading")}</div>;
  }

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-40">
        <button type="button" className="min-h-11 inline-flex items-center gap-2 text-sm text-pwa-text-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          <span>{t("profile.back")}</span>
        </button>

        <h1 className="text-lg font-semibold">{t("acceptance.title", { display_id: load.display_id })}</h1>

        <div
          className="max-h-[42vh] overflow-y-auto rounded-lg border border-pwa-border bg-[#101522] p-3 text-sm text-pwa-text-secondary"
          onScroll={(event) => {
            const el = event.currentTarget;
            const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
            const nextProgress = Math.min(1, el.scrollTop / maxScroll);
            setScrollProgress(nextProgress);
            if (el.scrollHeight - el.scrollTop - el.clientHeight <= 100) {
              setScrolledToBottom(true);
            }
          }}
          dangerouslySetInnerHTML={{ __html: load.rate_confirmation_html }}
        />

        <div className="rounded border border-pwa-border bg-pwa-card p-3">
          <div className="mb-2 text-xs font-semibold text-pwa-text-secondary">{t("acceptance.scroll_progress")}</div>
          <div className="mb-3 h-1 w-full rounded bg-[#202737]">
            <div className="h-1 rounded bg-[#93c5fd]" style={{ width: `${Math.round(scrollProgress * 100)}%` }} />
          </div>

          {!scrolledToBottom ? <div className="mb-2 text-xs text-[#fcd34d]">{t("acceptance.scroll_to_bottom")}</div> : null}
          {geofence.status === "ok" && !geofence.inside ? <div className="mb-2 rounded border border-[#dc2626] bg-[#2a1417] p-2 text-xs text-[#fca5a5]">{t("acceptance.must_be_at_pickup")} ({geofence.distance_miles.toFixed(2)} mi)</div> : null}
          {signatureDataUrl ? null : <div className="mb-2 text-xs text-pwa-text-secondary">{t("acceptance.signature_required")}</div>}
          <SignaturePad onChange={setSignatureDataUrl} disabled={!scrolledToBottom} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-pwa-border bg-pwa-card px-4 py-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <div className="mx-auto w-full max-w-md">
          <PwaButton
            className="w-full"
            disabled={!canSubmit}
            onClick={async () => {
              if (geofence.status !== "ok") return;
              try {
                await acceptLoad({
                  load_id: load.id,
                  signature_data_url: signatureDataUrl,
                  geo_lat: geofence.lat,
                  geo_lng: geofence.lng,
                  geo_accuracy_m: geofence.accuracy_m,
                  scroll_completed: scrolledToBottom,
                  accepted_at: new Date().toISOString(),
                });
                navigate(`/dvir/pre/${load.id}`);
              } catch {
                pushToast(t("common.retry"), "error");
              }
            }}
          >
            {t("acceptance.sign_and_accept")}
          </PwaButton>
        </div>
      </div>
    </div>
  );
}
