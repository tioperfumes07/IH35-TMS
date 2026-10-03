import type { AccountingHomeData } from "../../api/accountingHome";
import { formatUsdFromCents } from "../../pages/home/HomeKpiCard";
import { DrillKpiCard } from "../layout/DrillKpiCard";

type Props = {
  data: AccountingHomeData | undefined;
  isLoading: boolean;
};

/**
 * C8 — the accounting role-home KPI bar. The three tiles were bare <div>s: an owner could read
 * "$1.18M outstanding A/P" and had no way to open the bills behind it. Each now drills to its
 * subledger, and a missing payload still renders "—" (this bar was already honest about that).
 */
export function AccountingKpiBar({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <section className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-sm border border-slate-200 bg-slate-50" />
        ))}
      </section>
    );
  }

  const arTotal = data ? formatUsdFromCents(data.ar_aging.total_outstanding_cents) : null;
  const apTotal = data ? formatUsdFromCents(data.ap_aging.total_outstanding_cents) : null;
  const arCleared = data
    ? formatUsdFromCents(data.ar_aging.cleared_open_cents ?? data.ar_aging.total_outstanding_cents)
    : null;
  const apCleared = data
    ? formatUsdFromCents(data.ap_aging.cleared_open_cents ?? data.ap_aging.total_outstanding_cents)
    : null;
  const days = data?.period_close.days_to_close;
  const periodLabel = data?.period_close.period_label ?? "No open period";
  const countdown = days == null ? null : days === 0 ? "Due today" : `${days} day${days === 1 ? "" : "s"} to close`;
  const asOf = `As of ${data?.as_of_date ?? "today"}`;
  const arHint = arCleared ? `Cleared ${arCleared} · ${asOf}` : asOf;
  const apHint = apCleared ? `Cleared ${apCleared} · ${asOf}` : asOf;

  return (
    <section className="grid grid-cols-1 gap-2 md:grid-cols-3">
      <DrillKpiCard size="md" label="Outstanding A/R" value={arTotal} hint={arHint} to="/reports/ar-aging" />
      <DrillKpiCard size="md" label="Outstanding A/P" value={apTotal} hint={apHint} to="/reports/ap-aging" />
      <DrillKpiCard size="md" label="Period Close" value={countdown} hint={periodLabel} to="/accounting/period-close" />
    </section>
  );
}
