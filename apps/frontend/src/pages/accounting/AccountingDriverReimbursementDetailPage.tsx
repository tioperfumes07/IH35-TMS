import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getAccountingDriverReimbursement } from "../../api/accountingDriverReimbursement";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { entityLabel } from "../../lib/entity-label";
import { formatDateTimeUS, formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

const words = (value: string) => value.replaceAll("_", " ");

export function AccountingDriverReimbursementDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const query = useQuery({
    queryKey: ["accounting", "driver-reimbursement", companyId, id],
    queryFn: () => getAccountingDriverReimbursement(id, companyId),
    enabled: Boolean(companyId && id),
    retry: false,
  });
  const row = query.data;
  return <AccountingSubNavWrapper title={row ? `Driver reimbursement — ${row.reason}` : "Driver reimbursement"} subtitle="Canonical reimbursement claim, payout, and posting lineage">
    {!companyId ? <p className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-sm">Select an operating company to view this reimbursement.</p> : null}
    {query.isError ? <ListErrorState title="Couldn't load driver reimbursement" status={0} message={query.error instanceof Error ? query.error.message : undefined} onRetry={() => void query.refetch()} /> : null}
    {query.isPending && companyId ? <p className="text-sm text-slate-500">Loading driver reimbursement…</p> : null}
    {row ? <section className="grid gap-3 rounded-sm border border-slate-200 bg-white p-4 text-sm md:grid-cols-3">
      <div><span className="text-slate-500">Driver</span><p><EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} /></p></div>
      <div><span className="text-slate-500">Amount</span><p className="font-medium">{formatUsdCents(Number(row.amount_cents))}</p></div>
      <div><span className="text-slate-500">Type</span><p className="capitalize">{words(row.reimbursement_type)}</p></div>
      <div><span className="text-slate-500">Status</span><p className="capitalize">{words(row.status)}</p></div>
      <div><span className="text-slate-500">Pay mode</span><p className="capitalize">{words(row.pay_mode)}</p></div>
      <div><span className="text-slate-500">Posting date</span><p>{row.posting_date ? formatDateUS(row.posting_date) : "Not posted"}</p></div>
      <div><span className="text-slate-500">Load</span><p>{row.load_id ? <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} /> : "Not linked"}</p></div>
      <div><span className="text-slate-500">Settlement</span><p>{row.applied_to_settlement_id ? <EntityLink kind="settlement" id={row.applied_to_settlement_id} label={entityLabel(row.settlement_number, row.applied_to_settlement_id, "Settlement")} /> : "Not applied"}</p></div>
      <div><span className="text-slate-500">Journal entry</span><p>{row.journal_entry_id ? <EntityLink kind="journal_entry" id={row.journal_entry_id} label="Open journal entry" /> : "Not posted"}</p></div>
      <div><span className="text-slate-500">Pay from</span><p>{row.from_bank_account_id ? <EntityLink kind="bank_account" id={row.from_bank_account_id} label={entityLabel(row.bank_account_name, row.from_bank_account_id, "Bank account")} /> : "Default company bank"}</p></div>
      <div className="md:col-span-2"><span className="text-slate-500">Reason</span><p>{row.reason}</p></div>
      <div><span className="text-slate-500">Created</span><p>{formatDateTimeUS(row.created_at)}</p></div>
      {row.voided_at ? <div className="md:col-span-3"><span className="text-slate-500">Voided</span><p>{formatDateTimeUS(row.voided_at)}{row.void_reason ? ` — ${row.void_reason}` : ""}</p></div> : null}
    </section> : null}
  </AccountingSubNavWrapper>;
}
