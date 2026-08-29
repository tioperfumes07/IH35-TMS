import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AccountingHomeData } from "../../api/accountingHome";
import { fetchPendingApprovalsGl } from "../../api/accountingHome";
import { entityLabel } from "../../lib/entity-label";
import { formatShortDate, formatUsdFromCents } from "../../pages/home/HomeKpiCard";
import { useCompanyContext } from "../../contexts/CompanyContext";

type Props = {
  data: AccountingHomeData | undefined;
  isLoading: boolean;
};

function accountLabel(account: {
  account_number: string | null;
  account_name: string | null;
  coa_role: string | null;
}): string {
  const name = account.account_name ?? "";
  if (account.coa_role) return `${name || "Account"} (${account.coa_role})`;
  return name || "Account";
}

export function AccountingPendingApprovalsPanel({ data, isLoading }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const pendingQuery = useQuery({
    queryKey: ["accounting", "role-home", "pending-approvals", companyId],
    queryFn: () => fetchPendingApprovalsGl(companyId, { limit: 25, offset: 0 }),
    enabled: Boolean(companyId),
    refetchInterval: 120_000,
  });

  if (isLoading) {
    return (
      <section className="rounded-sm border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Pending &amp; Sync</div>
        <div className="space-y-2 p-3">
          <div className="h-4 animate-pulse rounded-sm bg-slate-100" />
          <div className="h-4 animate-pulse rounded-sm bg-slate-100" />
        </div>
      </section>
    );
  }

  const controlAvailable = pendingQuery.data?.control_available ?? true;
  const pending = data?.pending_journal_approvals ?? pendingQuery.data?.pending_journal_approvals ?? 0;
  const exceptions = pendingQuery.data?.exceptions ?? [];
  const items = (pendingQuery.data?.items ?? []).filter((i) => i.kind === "journal_approval");
  const qboDepth = data?.qbo.outbox_depth ?? 0;
  const qboFailed = data?.qbo.failed_outbox_count ?? 0;
  const earlyPay = data?.early_pay_discounts_expiring_this_week ?? 0;
  const lastSync = data?.qbo.last_sync_at;
  const unavailableMessage =
    exceptions.find((e) => e.code === "approval_control_unavailable" || e.code === "required_structure_unavailable")
      ?.message ?? "Journal approval control is unavailable — no migrated approval record.";

  return (
    <section className="rounded-sm border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Pending &amp; Sync</div>
      <ul className="divide-y divide-slate-100 text-sm">
        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>Journal entries awaiting approval (GL-linked)</span>
          <span className="font-semibold tabular-nums text-slate-900">{pending}</span>
        </li>
        {!controlAvailable ? (
          <li className="px-3 py-2 text-xs text-slate-700">
            Approval control unavailable: {unavailableMessage}
          </li>
        ) : null}
        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>QBO sync queue depth</span>
          <span className="font-semibold tabular-nums text-slate-900">{qboDepth}</span>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>Failed outbox events</span>
          <span className={`font-semibold tabular-nums ${qboFailed > 0 ? "text-slate-700" : "text-slate-900"}`}>
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

      <div className="border-t border-slate-100 px-3 py-2">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Approval queue</div>
        {pendingQuery.isLoading ? (
          <div className="h-4 animate-pulse rounded-sm bg-slate-100" />
        ) : pendingQuery.isError ? (
          <div className="flex items-center justify-between gap-3 text-sm text-red-700">
            <span>Failed to load pending journal approvals — this is not confirmed "no pending approvals."</span>
            <button
              type="button"
              onClick={() => void pendingQuery.refetch()}
              className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        ) : !controlAvailable ? (
          <p className="text-sm text-slate-700">{unavailableMessage}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No pending journal approvals.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const key = item.journal_entry_id ?? item.forward_drill.href ?? "item";
              const title = entityLabel(item.journal_display_id, item.journal_entry_id, "Journal entry");
              const accountSummary = item.governed_accounts
                .slice(0, 3)
                .map((a) => accountLabel(a))
                .join(", ");
              const drillHref = item.forward_drill.href;
              return (
                <li key={key} className="py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      {drillHref ? (
                        <Link to={drillHref} className="font-medium text-slate-900 hover:underline">
                          {title}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">{title}</span>
                      )}
                      <div className="mt-0.5 text-xs text-slate-500">
                        Journal approval
                        {item.status ? ` · ${item.status}` : ""}
                        {item.risk ? ` · ${item.risk}` : ""}
                        {item.voided ? " · voided" : ""}
                        {item.reversed ? " · reversed" : ""}
                        {item.maker_checker_violation ? " · maker=checker" : ""}
                      </div>
                      {item.reason ? <div className="mt-0.5 text-xs text-slate-600">{item.reason}</div> : null}
                      {item.assignment_exception ? (
                        <div className="mt-0.5 text-xs text-slate-700">
                          {item.assignment_exception.code}: {item.assignment_exception.message}
                        </div>
                      ) : null}
                      {accountSummary ? (
                        <div className="mt-0.5 text-xs text-slate-600">GL: {accountSummary}</div>
                      ) : null}
                      <div className="mt-0.5 text-xs text-slate-500">
                        {item.creator?.role ? `Creator role: ${item.creator.role}` : "Creator: —"}
                        {" · "}
                        {item.required_approver?.user_id || item.required_approver?.role
                          ? `Required approver: ${item.required_approver.role ?? entityLabel(null, item.required_approver.user_id, "User")}`
                          : "Required approver: unresolved"}
                      </div>
                    </div>
                    <div className="text-right text-xs tabular-nums text-slate-700">
                      <div>Dr {formatUsdFromCents(item.debit_total_cents)}</div>
                      <div>Cr {formatUsdFromCents(item.credit_total_cents)}</div>
                      <div className={item.amounts_balanced ? "text-slate-500" : "text-slate-700"}>
                        {item.amounts_balanced ? "Balanced" : "Unbalanced"}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {controlAvailable && pendingQuery.data?.has_more ? (
          <p className="mt-2 text-xs text-slate-500">
            Showing {items.length} of {pendingQuery.data.total}. Open journal entries for the full queue.
          </p>
        ) : null}
      </div>

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
