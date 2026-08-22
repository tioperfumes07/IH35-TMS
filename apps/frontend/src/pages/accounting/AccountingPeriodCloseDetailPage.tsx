import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getAccountingPeriodClose, type PeriodCloseEntry } from "../../api/accountingPeriodClose";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdCents } from "../../lib/money";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

const columns: Array<ParityColumn<PeriodCloseEntry>> = [
  { key: "journal_entry_id", label: "Closing entry", render: (row) => <EntityLink kind="journal_entry" id={row.journal_entry_id} label={entityLabel(row.memo, row.journal_entry_id, "Journal entry")} /> },
  { key: "entry_date", label: "Date", render: (row) => formatDateUS(row.entry_date) },
  { key: "status", label: "Status", render: (row) => row.status.replaceAll("_", " ") },
  { key: "debit_cents", label: "Debits", className: "text-right", render: (row) => formatUsdCents(Number(row.debit_cents)) },
  { key: "credit_cents", label: "Credits", className: "text-right", render: (row) => formatUsdCents(Number(row.credit_cents)) },
];

export function AccountingPeriodCloseDetailPage() {
  const { fiscalYearId = "" } = useParams<{ fiscalYearId: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const query = useQuery({ queryKey: ["accounting", "period-close", companyId, fiscalYearId], queryFn: () => getAccountingPeriodClose(fiscalYearId, companyId), enabled: Boolean(companyId && fiscalYearId), retry: false });
  return <AccountingSubNavWrapper title={query.data ? `Fiscal year ${query.data.fiscal_year} close` : "Fiscal-year close"} subtitle="Retained-earnings closing entries linked to this fiscal year">
    {!companyId ? <p className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-sm">Select an operating company to view this close.</p> : null}
    {query.isError ? <ListErrorState title="Couldn't load fiscal-year close" status={0} message={query.error instanceof Error ? query.error.message : undefined} onRetry={() => void query.refetch()} /> : null}
    {query.isPending && companyId ? <p className="text-sm text-slate-500">Loading fiscal-year close…</p> : null}
    {query.data ? <ParityTable columns={columns} rows={query.data.entries} rowKey={(row) => row.journal_entry_id} storageKey="accounting-period-close-entries" tableTestId="accounting-period-close-entries-table" emptyText="No closing entries linked to this fiscal year." /> : null}
  </AccountingSubNavWrapper>;
}
