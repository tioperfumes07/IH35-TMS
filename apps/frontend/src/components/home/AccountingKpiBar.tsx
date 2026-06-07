import type { AccountingHomeData } from "../../api/accountingHome";
import { formatUsdFromCents } from "../../pages/home/HomeKpiCard";

type Props = {
  data: AccountingHomeData | undefined;
  isLoading: boolean;
};

function KpiTile({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
      {subtext ? <div className="mt-0.5 text-[11px] text-slate-500">{subtext}</div> : null}
    </div>
  );
}

export function AccountingKpiBar({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <section className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] animate-pulse rounded border border-slate-200 bg-slate-50" />
        ))}
      </section>
    );
  }

  const arTotal = data ? formatUsdFromCents(data.ar_aging.total_outstanding_cents) : "—";
  const apTotal = data ? formatUsdFromCents(data.ap_aging.total_outstanding_cents) : "—";
  const days = data?.period_close.days_to_close;
  const periodLabel = data?.period_close.period_label ?? "No open period";
  const countdown =
    days == null ? "—" : days === 0 ? "Due today" : `${days} day${days === 1 ? "" : "s"} to close`;

  return (
    <section className="grid grid-cols-1 gap-2 md:grid-cols-3">
      <KpiTile label="Outstanding A/R" value={arTotal} subtext={`As of ${data?.as_of_date ?? "today"}`} />
      <KpiTile label="Outstanding A/P" value={apTotal} subtext={`As of ${data?.as_of_date ?? "today"}`} />
      <KpiTile label="Period Close" value={countdown} subtext={periodLabel} />
    </section>
  );
}
