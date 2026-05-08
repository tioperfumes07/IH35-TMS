import { useQuery } from "@tanstack/react-query";
import { getMyHosClocks } from "../api/hos";
import { HosClockCard } from "../components/HosClock";
import { PwaCard } from "../components/PwaCard";
import { useTranslation } from "react-i18next";

function dutyPillClass(status: string) {
  switch (status) {
    case "driving":
      return "bg-[#14532d] text-[#86efac]";
    case "on_duty_not_driving":
      return "bg-[#92400e] text-[#fcd34d]";
    case "sleeper_berth":
      return "bg-[#581c87] text-[#c4b5fd]";
    default:
      return "bg-[#404756] text-[#94a3b8]";
  }
}

export function HosPage() {
  const { t } = useTranslation();
  const hosQuery = useQuery({ queryKey: ["pwa", "hos"], queryFn: getMyHosClocks });
  const data = hosQuery.data;

  if (hosQuery.isLoading) return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("common.loading")}</div>;
  if (!data) return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("today.empty")}</div>;

  const staleMs = Date.now() - new Date(data.last_synced_at).getTime();
  const isStale = staleMs > 5 * 60 * 1000;

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <PwaCard title={t("hos.title")} subtitle={t("hos.last_synced", { ts: new Date(data.last_synced_at).toLocaleTimeString() })}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-pwa-text-secondary">{t("hos.duty_status_label")}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${dutyPillClass(data.duty_status)}`}>
              {t(`hos.duty_status.${data.duty_status}`)}
            </span>
          </div>
          {isStale ? <div className="rounded border border-[#92400e] bg-[#2a2415] p-2 text-xs text-[#fcd34d]">{t("hos.stale_data")}</div> : null}
        </PwaCard>
        <div className="grid gap-2">
          {data.clocks.map((clock) => (
            <HosClockCard key={clock.key} clock={clock} label={t(`hos.clock.${clock.key}`)} remainingLabel={t("hos.remaining")} />
          ))}
        </div>
      </div>
    </div>
  );
}
