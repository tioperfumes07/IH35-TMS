import { Link } from "react-router-dom";
import type { AccountingHomeData } from "../../api/accountingHome";
import { formatShortDate } from "../../pages/home/HomeKpiCard";

type Props = {
  data: AccountingHomeData | undefined;
  isLoading: boolean;
};

export function AccountingPendingApprovalsPanel({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <section className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Pending &amp; Sync</div>
        <div className="space-y-2 p-3">
          <div className="h-4 animate-pulse rounded bg-slate-100" />
          <div className="h-4 animate-pulse rounded bg-slate-100" />
        </div>
      </section>
    );
  }

  const pending = data?.pending_journal_approvals ?? 0;
  const qboDepth = data?.qbo.outbox_depth ?? 0;
  const qboFailed = data?.qbo.failed_outbox_count ?? 0;
  const earlyPay = data?.early_pay_discounts_expiring_this_week ?? 0;
  const lastSync = data?.qbo.last_sync_at;

  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Pending &amp; Sync</div>
      <ul className="divide-y divide-slate-100 text-sm">
        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>Journal entries awaiting period-close review</span>
          <span className="font-semibold tabular-nums text-slate-900">{pending}</span>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>QBO sync queue depth</span>
          <span className="font-semibold tabular-nums text-slate-900">{qboDepth}</span>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>Failed outbox events</span>
          <span className={`font-semibold tabular-nums ${qboFailed > 0 ? "text-amber-800" : "text-slate-900"}`}>
            {qboFailed}
          </span>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>Early-pay discounts expiring this week</span>
          <span className="font-semibold tabular-nums text-slate-900">{earlyPay}</span>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-slate-500">
          <span>Last QBO sync</span>
          <span>{lastSync ? formatShortDate(lastSync) : "No successful sync recorded"}</span>
        </li>
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2">
        <Link to="/accounting/journal-entries" className="text-xs font-medium text-slate-700 hover:underline">
          Journal entries
        </Link>
        <Link to="/accounting/invoices" className="text-xs font-medium text-slate-700 hover:underline">
          Accounting home
        </Link>
        <Link to="/reports/ar-aging" className="text-xs font-medium text-slate-700 hover:underline">
          AR aging report
        </Link>
      </div>
    </section>
  );
}
