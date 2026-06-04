import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { getLoadDetail } from "../api/loads";
import { LifecyclePill } from "../components/LifecyclePill";
import { PwaCard } from "../components/PwaCard";

type TabId = "overview" | "stops" | "documents";

export function LoadDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("overview");
  const loadQuery = useQuery({ queryKey: ["pwa", "loads", "detail", id], queryFn: () => getLoadDetail(id), enabled: Boolean(id) });
  const load = loadQuery.data;

  if (loadQuery.isLoading) {
    return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("common.loading")}</div>;
  }
  if (!load) {
    return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("today.empty")}</div>;
  }

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <div className="flex items-center justify-between">
          <button type="button" className="min-h-11 inline-flex items-center gap-2 text-sm text-pwa-text-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <LifecyclePill stage={load.lifecycle_stage} />
        </div>

        <PwaCard title={`Load ${load.display_id}`} subtitle={load.customer_name}>
          <div className="mt-1 text-xs text-pwa-text-secondary">
            {load.pickup_location} → {load.delivery_location}
          </div>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              data-testid="dvir-pre-trip-card"
              className="min-h-11 rounded border border-pwa-border px-3 text-left text-xs font-semibold text-pwa-text-secondary"
              onClick={() => navigate(`/dvir/pre/${load.id}`)}
            >
              Pre-trip DVIR
            </button>
            <button
              type="button"
              data-testid="dvir-post-trip-card"
              className="min-h-11 rounded border border-pwa-border px-3 text-left text-xs font-semibold text-pwa-text-secondary"
              onClick={() => navigate(`/dvir/post/${load.id}`)}
            >
              Post-trip DVIR
            </button>
          </div>
        </PwaCard>

        <div className="overflow-x-auto border-b border-pwa-border bg-pwa-card px-2 py-1">
          <div className="flex min-w-max gap-4">
            {(["overview", "stops", "documents"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`min-h-11 border-b-2 pb-0.5 text-xs font-semibold ${
                  tab === item ? "border-b-white text-white" : "border-b-transparent text-pwa-text-secondary"
                }`}
              >
                {t(`load.tab_${item}`)}
              </button>
            ))}
          </div>
        </div>

        {tab === "overview" ? (
          <PwaCard>
            <div className="mb-2 rounded border border-pwa-border px-2 py-1 text-[11px] text-pwa-text-secondary">
              <div>Important legal notice: confirm pickup and delivery details before accepting any settlement or deduction item.</div>
              <div className="opacity-80">Aviso legal importante: confirme los detalles de recoleccion y entrega antes de aceptar cualquier liquidacion o deduccion.</div>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="text-pwa-text-secondary">{t("load.miles")}:</span> {load.miles}</div>
              <div><span className="text-pwa-text-secondary">{t("load.rate")}:</span> ${(load.rate_cents / 100).toFixed(2)}</div>
              <div><span className="text-pwa-text-secondary">{t("load.equipment")}:</span> {load.equipment}</div>
              <div>
                <span className="text-pwa-text-secondary">{t("load.dispatcher")}:</span> {load.dispatcher_name}{" "}
                {load.dispatcher_phone ? <a className="underline" href={`tel:${load.dispatcher_phone}`}>{load.dispatcher_phone}</a> : null}
              </div>
              <div><span className="text-pwa-text-secondary">{t("load.scheduled_pickup")}:</span> {new Date(load.pickup_at).toLocaleString()}</div>
              <div><span className="text-pwa-text-secondary">{t("load.scheduled_delivery")}:</span> {new Date(load.delivery_at).toLocaleString()}</div>
            </div>
          </PwaCard>
        ) : null}

        {tab === "stops" ? (
          <div className="space-y-2">
            {load.stops.map((stop) => (
              <button
                key={stop.id}
                type="button"
                className="min-h-11 w-full rounded-lg border border-pwa-border bg-pwa-card p-3 text-left"
                onClick={() => navigate(`/loads/${load.id}/stops/${stop.id}`)}
              >
                <div className="text-xs text-pwa-text-secondary">Stop {stop.sequence}</div>
                <div className="text-sm font-semibold capitalize">{stop.type}</div>
                <div className="text-xs text-pwa-text-secondary">{stop.location_name} · {stop.city}, {stop.state}</div>
                <div className="mt-1 text-xs text-pwa-text-secondary">
                  {new Date(stop.scheduled_arrival_at).toLocaleString()} → {new Date(stop.scheduled_departure_at).toLocaleString()}
                </div>
                <div className="mt-2">
                  <span className="rounded-full border border-pwa-border px-2 py-0.5 text-[10px] uppercase tracking-[0.04em] text-pwa-text-secondary">{t(`stop.${stop.status}`)}</span>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {tab === "documents" ? (
          <PwaCard>
            <div className="text-sm text-pwa-text-secondary">{t("load.documents_coming_soon")}</div>
          </PwaCard>
        ) : null}
      </div>
    </div>
  );
}
