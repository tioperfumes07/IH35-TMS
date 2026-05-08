import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { getLoadDetail, markStopArrived, markStopDeparted } from "../api/loads";
import { UploadDocumentModal } from "../components/UploadDocumentModal";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useGeofence } from "../lib/geofence";

export function StopActionPage() {
  const { id = "", stopId = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [hasDoc, setHasDoc] = useState(false);
  const [stopStatus, setStopStatus] = useState<"pending" | "arrived" | "loading" | "loaded" | "departed" | null>(null);

  const loadQuery = useQuery({ queryKey: ["pwa", "loads", "detail", id], queryFn: () => getLoadDetail(id), enabled: Boolean(id) });
  const load = loadQuery.data;
  const stop = useMemo(() => load?.stops.find((item) => item.id === stopId) ?? null, [load, stopId]);
  const status = stopStatus ?? stop?.status ?? "pending";
  const geofence = useGeofence(stop?.lat ?? 0, stop?.lng ?? 0, ((stop?.geofence_radius_m ?? 40233.6) / 1609.34));

  if (!load || !stop) {
    return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("common.loading")}</div>;
  }
  const resolvedLoad = load;
  const resolvedStop = stop;

  const geofenceCard =
    geofence.status === "pending"
      ? { cls: "text-pwa-text-secondary", text: t("stop.geofence_pending") }
      : geofence.status === "denied"
        ? { cls: "text-[#fca5a5]", text: t("stop.geofence_denied") }
        : geofence.inside
          ? { cls: "text-[#86efac]", text: t("stop.geofence_inside") }
          : geofence.distance_miles < 0.5
            ? { cls: "text-[#fcd34d]", text: t("stop.geofence_approaching", { distance: geofence.distance_miles.toFixed(2) }) }
            : { cls: "text-pwa-text-secondary", text: t("stop.geofence_outside", { distance: geofence.distance_miles.toFixed(2) }) };

  async function handleArrive() {
    if (geofence.status !== "ok") return;
    await markStopArrived(resolvedLoad.id, resolvedStop.id, { lat: geofence.lat, lng: geofence.lng, accuracy_m: geofence.accuracy_m });
    setStopStatus("arrived");
  }

  async function handleDepart() {
    if (geofence.status !== "ok") return;
    await markStopDeparted(resolvedLoad.id, resolvedStop.id, { lat: geofence.lat, lng: geofence.lng, accuracy_m: geofence.accuracy_m });
    setStopStatus("departed");
  }

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <button type="button" className="min-h-11 inline-flex items-center gap-2 text-sm text-pwa-text-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          <span>{t("profile.back")}</span>
        </button>

        <PwaCard title={`${t("stop.of_total", { current: resolvedStop.sequence, total: resolvedLoad.stops.length })}`} subtitle={resolvedStop.location_name}>
          <div className={`rounded-lg border border-pwa-border bg-[#101522] p-3 text-sm ${geofenceCard.cls}`}>{geofenceCard.text}</div>
        </PwaCard>

        <PwaCard>
          {status === "pending" ? (
            <PwaButton className="w-full" onClick={() => void handleArrive()}>{t("stop.mark_arrived")}</PwaButton>
          ) : null}
          {status === "arrived" && !hasDoc ? (
            <PwaButton className="w-full" onClick={() => setUploadOpen(true)}>{t("stop.upload_bol_pod")}</PwaButton>
          ) : null}
          {status === "arrived" && hasDoc ? (
            <PwaButton className="w-full" onClick={() => void handleDepart()}>{t("stop.mark_departed")}</PwaButton>
          ) : null}
          {status === "departed" ? <div className="text-sm text-pwa-text-secondary">{t("stop.departed_at")}: {new Date().toLocaleTimeString()}</div> : null}
        </PwaCard>

        <PwaButton variant="secondary" onClick={() => navigate(`/incident/new?loadId=${resolvedLoad.id}&stopId=${resolvedStop.id}`)}>
          {t("stop.report_issue")}
        </PwaButton>
      </div>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onQueued={() => setHasDoc(true)}
        defaultEntityType="load_stop"
        defaultEntityId={resolvedStop.id}
        allowedCategoryCodes={["bol", "pod", "lumper_receipt", "damage_photo"]}
        title={t("stop.upload_bol_pod")}
      />
    </div>
  );
}
