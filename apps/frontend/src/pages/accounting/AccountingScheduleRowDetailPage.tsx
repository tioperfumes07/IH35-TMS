import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getAccountingScheduleRow, type AccountingScheduleRowKind } from "../../api/accountingScheduleRow";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

const names: Record<AccountingScheduleRowKind, string> = { prepaid_amortization_row: "Prepaid amortization period", depreciation_schedule_row: "Depreciation period", loan_amortization_row: "Loan payment period" };
export function AccountingScheduleRowDetailPage() {
  const { kind = "", id = "" } = useParams<{ kind: AccountingScheduleRowKind; id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const validKind = kind === "prepaid_amortization_row" || kind === "depreciation_schedule_row" || kind === "loan_amortization_row";
  const query = useQuery({ queryKey: ["accounting", "schedule-row", companyId, kind, id], queryFn: () => getAccountingScheduleRow(kind as AccountingScheduleRowKind, id, companyId), enabled: Boolean(companyId && id && validKind), retry: false });
  const row = query.data;
  return <AccountingSubNavWrapper title={row ? `${names[row.kind]} ${row.sequence}` : "Schedule period"} subtitle="Canonical period, parent record, and posted journal entry">
    {!companyId ? <p className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-sm">Select an operating company to view this period.</p> : null}
    {!validKind ? <ListErrorState title="Unsupported schedule period" status={400} onRetry={() => undefined} /> : null}
    {query.isError ? <ListErrorState title="Couldn't load schedule period" status={0} message={query.error instanceof Error ? query.error.message : undefined} onRetry={() => void query.refetch()} /> : null}
    {query.isPending && companyId && validKind ? <p className="text-sm text-slate-500">Loading schedule period…</p> : null}
    {row ? <section className="grid gap-3 rounded-sm border border-slate-200 bg-white p-4 text-sm md:grid-cols-3">
      <div><span className="text-slate-500">Parent</span><p><EntityLink kind={row.parent_kind} id={row.parent_id} label={row.parent_label} /></p></div>
      <div><span className="text-slate-500">Effective date</span><p>{formatDateUS(row.effective_date)}</p></div>
      <div><span className="text-slate-500">Status</span><p>{row.posted ? "Posted" : "Scheduled"}</p></div>
      <div><span className="text-slate-500">Amount</span><p>{formatUsdCents(Number(row.amount_cents))}</p></div>
      <div><span className="text-slate-500">Ending balance</span><p>{formatUsdCents(Number(row.balance_cents))}</p></div>
      <div><span className="text-slate-500">Journal entry</span><p>{row.posted_journal_entry_id ? <EntityLink kind="journal_entry" id={row.posted_journal_entry_id} label="Open journal entry" /> : "Not posted"}</p></div>
    </section> : null}
  </AccountingSubNavWrapper>;
}
