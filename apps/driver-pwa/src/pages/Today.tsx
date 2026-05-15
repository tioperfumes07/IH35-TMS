import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getMyLoadsToday } from "../api/loads";
import { LifecyclePill } from "../components/LifecyclePill";
import { PwaCard } from "../components/PwaCard";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";

function relativeTime(iso: string) {
  const deltaMs = new Date(iso).getTime() - Date.now();
  const deltaMin = Math.round(deltaMs / 60000);
  if (Math.abs(deltaMin) < 60) return `${deltaMin}m`;
  const deltaHr = Math.round(deltaMin / 60);
  return `${deltaHr}h`;
}

export function TodayPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadsQuery = useQuery({
    queryKey: ["pwa", "loads", "today"],
    queryFn: getMyLoadsToday,
  });

  useRealtimeChannel({
    topics: [],
    onMessage: () => {
      void queryClient.invalidateQueries({ queryKey: ["pwa", "loads", "today"] });
    },
  });

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <PwaCard title={t("today.title")} subtitle={t("today.pull_to_refresh")}>
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              className="min-h-11 rounded-full border border-pwa-border px-3 text-xs font-semibold text-pwa-text-secondary"
              onClick={() => navigate("/hos")}
            >
              HOS
            </button>
          </div>
          <div className="mb-3">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-pwa-border px-3 text-sm font-semibold text-pwa-text-secondary"
              onClick={() => void loadsQuery.refetch()}
            >
              {t("today.pull_to_refresh")}
            </button>
          </div>
          {loadsQuery.isLoading ? <p className="text-sm text-pwa-text-secondary">{t("common.loading")}</p> : null}
          {(loadsQuery.data ?? []).length === 0 && !loadsQuery.isLoading ? <p className="text-sm text-pwa-text-secondary">{t("today.empty")}</p> : null}
          <div className="space-y-2">
            {(loadsQuery.data ?? []).map((load) => (
              <button
                key={load.id}
                type="button"
                className="min-h-11 w-full rounded-lg border border-pwa-border bg-[#101522] p-3 text-left"
                onClick={() => {
                  if (!load.accepted_at) {
                    navigate(`/loads/${load.id}/accept`);
                    return;
                  }
                  navigate(`/loads/${load.id}`);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{load.display_id}</div>
                    <div className="text-xs text-pwa-text-secondary">{load.customer_name}</div>
                  </div>
                  {!load.accepted_at ? <span className="rounded border border-[#dc2626] px-1.5 py-0.5 text-[10px] font-semibold text-[#fca5a5]">{t("load.accept_required")}</span> : null}
                </div>
                <div className="mt-2 text-xs text-pwa-text-secondary">
                  {load.pickup_location} → {load.delivery_location}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <LifecyclePill stage={load.lifecycle_stage} />
                  <span className="text-xs text-pwa-text-secondary">{relativeTime(load.pickup_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </PwaCard>
      </div>
    </div>
  );
}
