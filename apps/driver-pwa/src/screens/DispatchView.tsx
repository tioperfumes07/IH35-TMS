import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { DeliveryCard } from "../components/dispatch/DeliveryCard";
import { DocUploadDrawer } from "../components/dispatch/DocUploadDrawer";
import { PickupCard } from "../components/dispatch/PickupCard";
import { LifecyclePill } from "../components/LifecyclePill";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";
import {
  attachStopDocument,
  fetchDispatchView,
  markDispatchStopArrival,
  markDispatchStopDeparture,
  type DispatchViewStop,
} from "../lib/dispatch-api-client";

export function DispatchViewScreen() {
  const { load_uuid: loadUuid = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [busyStop, setBusyStop] = useState<string | null>(null);
  const [uploadStop, setUploadStop] = useState<DispatchViewStop | null>(null);

  const viewQuery = useQuery({
    queryKey: ["pwa", "dispatch-view", loadUuid],
    queryFn: () => fetchDispatchView(loadUuid),
    enabled: Boolean(loadUuid),
  });

  const pickup = useMemo(() => viewQuery.data?.stops.find((stop) => stop.type === "pickup") ?? null, [viewQuery.data]);
  const deliveries = useMemo(() => viewQuery.data?.stops.filter((stop) => stop.type === "delivery") ?? [], [viewQuery.data]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["pwa", "dispatch-view", loadUuid] });
  }

  async function withGeo(stop: DispatchViewStop, action: "arrival" | "departure") {
    setBusyStop(stop.stop_uuid);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("no_geolocation"));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      const geo = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy_m: position.coords.accuracy,
      };
      if (action === "arrival") {
        await markDispatchStopArrival(loadUuid, stop.stop_uuid, geo);
        pushToast(t("dispatch.arrival_recorded"), "success");
      } else {
        await markDispatchStopDeparture(loadUuid, stop.stop_uuid, geo);
        pushToast(t("dispatch.departure_recorded"), "success");
      }
      await refresh();
    } catch {
      pushToast(t("dispatch.action_failed"), "error");
    } finally {
      setBusyStop(null);
    }
  }

  async function handleUploaded(evidenceUuid: string) {
    if (!uploadStop) return;
    const docType = uploadStop.type === "pickup" ? "bol" : "pod";
    try {
      await attachStopDocument(loadUuid, uploadStop.stop_uuid, { evidence_uuid: evidenceUuid, doc_type: docType });
      pushToast(t("dispatch.document_attached"), "success");
      setUploadStop(null);
      await refresh();
    } catch {
      pushToast(t("dispatch.document_attach_failed"), "error");
    }
  }

  if (viewQuery.isLoading) {
    return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("dispatch.screen_loading")}</div>;
  }

  if (!viewQuery.data) {
    return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("dispatch.screen_not_found")}</div>;
  }

  const view = viewQuery.data;

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary" data-testid="dispatch-view-screen">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <button type="button" className="min-h-11 inline-flex items-center gap-2 text-sm text-pwa-text-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          <span>{t("common.back")}</span>
        </button>

        <PwaCard title={view.load_number} subtitle={view.customer_name}>
          <div className="mt-2 flex items-center justify-between">
            <span className="rounded border border-pwa-border px-2 py-0.5 text-xs capitalize">{view.status.replace(/_/g, " ")}</span>
            <LifecyclePill stage="en_route_pickup" />
          </div>
          {view.special_instructions ? (
            <div className="mt-3 rounded bg-[#101522] p-2 text-xs text-pwa-text-secondary">{view.special_instructions}</div>
          ) : null}
        </PwaCard>

        {pickup ? (
          <PickupCard
            stop={pickup}
            loadUuid={loadUuid}
            busy={busyStop === pickup.stop_uuid}
            onArrived={() => void withGeo(pickup, "arrival")}
            onDeparted={() => void withGeo(pickup, "departure")}
            onUploadDoc={() => setUploadStop(pickup)}
          />
        ) : null}

        {deliveries.map((stop) => (
          <DeliveryCard
            key={stop.stop_uuid}
            stop={stop}
            loadUuid={loadUuid}
            busy={busyStop === stop.stop_uuid}
            onArrived={() => void withGeo(stop, "arrival")}
            onDeparted={() => void withGeo(stop, "departure")}
            onUploadDoc={() => setUploadStop(stop)}
          />
        ))}
      </div>

      <DocUploadDrawer
        open={uploadStop !== null}
        onClose={() => setUploadStop(null)}
        onUploaded={(evidenceUuid) => void handleUploaded(evidenceUuid)}
        docType={uploadStop?.type === "pickup" ? "bol" : "pod"}
      />
    </div>
  );
}
