import { useQuery } from "@tanstack/react-query";
import { getMyCurrentCycle, getMyPastCycles } from "../api/earnings";
import { PwaCard } from "../components/PwaCard";
import { TrueStatusChips } from "../components/TrueStatusChips";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function EarningsPage() {
  const { t, i18n } = useTranslation();
  const currentCycleQuery = useQuery({ queryKey: ["pwa", "earnings", "current"], queryFn: getMyCurrentCycle });
  const pastCyclesQuery = useQuery({ queryKey: ["pwa", "earnings", "past"], queryFn: getMyPastCycles });
  const cycle = currentCycleQuery.data;
  const pastCycles = pastCyclesQuery.data ?? [];

  useEffect(() => {
    if (!cycle?.preferred_language) return;
    if (!i18n.language.startsWith(cycle.preferred_language)) {
      void i18n.changeLanguage(cycle.preferred_language);
    }
  }, [cycle?.preferred_language, i18n]);

  if (currentCycleQuery.isLoading) return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("common.loading")}</div>;
  if (!cycle) return <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-secondary">{t("today.empty")}</div>;

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <PwaCard title={t("earnings.title")} subtitle={t("earnings.cycle_label")}>
          <div className="mb-2 rounded border border-pwa-border px-2 py-1 text-[11px] text-pwa-text-secondary">
            <div>{cycle.settlement_terms.language_disclaimer?.primary}</div>
            <div className="opacity-80">{cycle.settlement_terms.language_disclaimer?.secondary}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>{t("earnings.loads_completed")}: {cycle.loads_completed}</div>
            <div>{t("earnings.miles_driven")}: {cycle.miles_driven}</div>
            <div>{t("earnings.gross")}: {money(cycle.gross_cents)}</div>
            <div>{t("earnings.advances")}: {money(cycle.advances_cents)}</div>
            <div>{t("earnings.deductions")}: {money(cycle.deductions_cents)}</div>
            <div>{t("earnings.escrow")}: {money(cycle.escrow_cents)}</div>
            <div>{t("earnings.net_preview")}: {money(cycle.net_preview_cents)}</div>
            <div>{t("earnings.final_settlement")}: {cycle.final_settlement_cents ? money(cycle.final_settlement_cents) : "--"}</div>
          </div>
        </PwaCard>

        <PwaCard title={t("earnings.title")}>
          {cycle.loads.length === 0 ? <div className="text-sm text-pwa-text-secondary">{t("earnings.no_loads_in_cycle")}</div> : null}
          <div className="space-y-2">
            {cycle.loads.map((load) => (
              <div key={load.id} className="rounded border border-pwa-border bg-[#101522] p-2">
                <div className="mb-1 text-sm font-semibold">{load.load_display_id}</div>
                <div className="mb-1 text-xs text-pwa-text-secondary">{load.miles} mi · {money(load.gross_cents)}</div>
                <TrueStatusChips
                  status={load.status}
                  labels={{
                    delivered: t("true_status.delivered"),
                    invoiced: t("true_status.invoiced"),
                    factored: t("true_status.factored"),
                    paid: t("true_status.paid"),
                  }}
                />
              </div>
            ))}
          </div>
        </PwaCard>

        <PwaCard title={t("earnings.past_cycles")}>
          <div className="space-y-1">
            {pastCycles.slice(0, 4).map((entry) => (
              <div key={entry.cycle_id} className="rounded border border-pwa-border px-2 py-1 text-xs">
                {new Date(entry.period_start).toLocaleDateString()} - {new Date(entry.period_end).toLocaleDateString()} · {money(entry.net_preview_cents)}
              </div>
            ))}
          </div>
        </PwaCard>
      </div>
    </div>
  );
}
