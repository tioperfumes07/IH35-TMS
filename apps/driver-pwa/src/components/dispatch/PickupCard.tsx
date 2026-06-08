import { MapPin, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DispatchViewStop } from "../../lib/dispatch-api-client";
import { PwaButton } from "../PwaButton";
import { PwaCard } from "../PwaCard";

type PickupCardProps = {
  stop: DispatchViewStop;
  loadUuid: string;
  onArrived: () => void;
  onDeparted: () => void;
  onUploadDoc: () => void;
  busy?: boolean;
};

function stopStatusKey(stop: DispatchViewStop): "status_departed" | "status_docs_uploaded" | "status_arrived" | "status_pending" {
  if (stop.status === "departed") return "status_departed";
  if (stop.docs_uploaded) return "status_docs_uploaded";
  if (stop.status === "arrived" || stop.status === "loading" || stop.status === "loaded") return "status_arrived";
  return "status_pending";
}

function mapsUrl(stop: DispatchViewStop): string {
  const query = encodeURIComponent(`${stop.address}, ${stop.city}, ${stop.state}`.trim());
  return `https://maps.google.com/?q=${query}`;
}

export function PickupCard({ stop, onArrived, onDeparted, onUploadDoc, busy }: PickupCardProps) {
  const { t } = useTranslation();
  const status = t(`dispatch.${stopStatusKey(stop)}`);

  return (
    <PwaCard title={t("dispatch.pickup_title")} subtitle={stop.location_name} data-testid="dispatch-pickup-card">
      <div className="space-y-2 text-sm">
        <div className="rounded border border-pwa-border px-2 py-1 text-xs capitalize text-pwa-text-secondary">
          {t("dispatch.status_label", { status, geofence: stop.geofence_status })}
        </div>
        <div className="text-xs text-pwa-text-secondary">
          {stop.address}, {stop.city}, {stop.state}
        </div>
        <a className="inline-flex min-h-11 items-center gap-1 text-xs underline" href={mapsUrl(stop)} target="_blank" rel="noreferrer">
          <MapPin className="h-3.5 w-3.5" />
          {t("dispatch.open_in_maps")}
        </a>
        {stop.contact_name || stop.contact_phone ? (
          <div className="text-xs">
            {stop.contact_name ? <span>{stop.contact_name}</span> : null}
            {stop.contact_phone ? (
              <a className="ml-2 inline-flex items-center gap-1 underline" href={`tel:${stop.contact_phone}`}>
                <Phone className="h-3.5 w-3.5" />
                {stop.contact_phone}
              </a>
            ) : null}
          </div>
        ) : null}
        {stop.hours ? <div className="text-xs text-pwa-text-secondary">{t("dispatch.hours_label", { hours: stop.hours })}</div> : null}
        <div className="text-xs text-pwa-text-secondary">
          {t("dispatch.window_label", {
            start: new Date(stop.scheduled_arrival_at).toLocaleString(),
            end: new Date(stop.scheduled_departure_at).toLocaleString(),
          })}
        </div>
        {stop.actual_arrival_at ? (
          <div className="text-xs">{t("dispatch.arrived_at", { time: new Date(stop.actual_arrival_at).toLocaleString() })}</div>
        ) : null}
        {stop.actual_departure_at ? (
          <div className="text-xs">{t("dispatch.departed_at", { time: new Date(stop.actual_departure_at).toLocaleString() })}</div>
        ) : null}
        {stop.dispatcher_notes ? <div className="rounded bg-[#101522] p-2 text-xs">{stop.dispatcher_notes}</div> : null}
        <div className="text-xs text-pwa-text-secondary">
          {t("dispatch.docs_label", { docs: stop.doc_requirements.join(", ").toUpperCase() || "—" })}
        </div>
        <div className="flex flex-col gap-2 pt-1">
          {stop.status === "pending" ? (
            <PwaButton className="w-full" disabled={busy} onClick={onArrived}>
              {t("dispatch.arrived_btn")}
            </PwaButton>
          ) : null}
          {(stop.status === "arrived" || stop.status === "loading" || stop.status === "loaded") && !stop.docs_uploaded ? (
            <PwaButton className="w-full" variant="secondary" disabled={busy} onClick={onUploadDoc}>
              {t("dispatch.upload_doc_btn")}
            </PwaButton>
          ) : null}
          {stop.status === "arrived" || stop.status === "loading" || stop.status === "loaded" ? (
            <PwaButton className="w-full" disabled={busy} onClick={onDeparted}>
              {t("dispatch.departed_btn")}
            </PwaButton>
          ) : null}
        </div>
      </div>
    </PwaCard>
  );
}
