import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getAccountingLeaseDetail, type AccountingLeaseAsset, type AccountingLeaseScheduleRow } from "../../api/accountingLease";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { entityLabel } from "../../lib/entity-label";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

const money = (value: string) => formatUsdCents(Number(value || 0));

const assetColumns: Array<ParityColumn<AccountingLeaseAsset>> = [
  { key: "fixed_asset_id", label: "Fixed asset", render: (row) => <EntityLink kind="fixed_asset" id={row.fixed_asset_id} label={entityLabel(row.asset_number ?? row.fixed_asset_name, row.fixed_asset_id, "Fixed asset")} /> },
  { key: "unit_uuid", label: "Unit", render: (row) => row.unit_uuid ? <EntityLink kind="unit" id={row.unit_uuid} label={entityLabel(row.unit_number, row.unit_uuid, "Unit")} /> : "—" },
  { key: "allocated_cost_cents", label: "Allocated cost", className: "text-right", render: (row) => money(row.allocated_cost_cents) },
];

const scheduleColumns: Array<ParityColumn<AccountingLeaseScheduleRow>> = [
  { key: "period_number", label: "Period", sortable: true },
  { key: "period_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.period_date) },
  { key: "payment_cents", label: "Payment", className: "text-right", render: (row) => money(row.payment_cents) },
  { key: "principal_cents", label: "Principal", className: "text-right", render: (row) => money(row.principal_cents) },
  { key: "interest_cents", label: "Interest", className: "text-right", render: (row) => money(row.interest_cents) },
  { key: "receivable_balance_cents", label: "Balance", className: "text-right", render: (row) => money(row.receivable_balance_cents) },
  { key: "posted_journal_entry_id", label: "Journal entry", render: (row) => row.posted_journal_entry_id ? <EntityLink kind="journal_entry" id={row.posted_journal_entry_id} label="Open journal entry" /> : "—" },
];

export function AccountingLeaseDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const detailQuery = useQuery({
    queryKey: ["accounting", "lease-contract", companyId, id],
    queryFn: () => getAccountingLeaseDetail(id, companyId),
    enabled: Boolean(companyId && id),
    retry: false,
  });
  const detail = detailQuery.data;

  return (
    <AccountingSubNavWrapper title={detail?.contract.display_id || "Lease contract"} subtitle="ASC 842 contract, linked assets, and stored schedule">
      {!companyId ? <p className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Select an operating company to view this lease.</p> : null}
      {detailQuery.isError ? <ListErrorState title="Couldn't load lease contract" status={0} message={detailQuery.error instanceof Error ? detailQuery.error.message : undefined} onRetry={() => void detailQuery.refetch()} /> : null}
      {detailQuery.isPending && companyId ? <p className="text-sm text-slate-500">Loading lease contract…</p> : null}
      {detail ? (
        <div className="space-y-4">
          <section className="grid gap-3 rounded-sm border border-slate-200 bg-white p-4 text-sm md:grid-cols-3">
            <div><span className="text-slate-500">Status</span><p className="font-medium text-slate-900">{detail.contract.status}</p></div>
            <div><span className="text-slate-500">Election</span><p className="font-medium text-slate-900">{detail.contract.election}</p></div>
            <div><span className="text-slate-500">Term</span><p className="font-medium text-slate-900">{formatDateUS(detail.contract.commencement_date)} – {formatDateUS(detail.contract.end_date)}</p></div>
            <div><span className="text-slate-500">Payment</span><p className="font-medium text-slate-900">{money(detail.contract.payment_amount_cents)} · {detail.contract.payment_frequency}</p></div>
            <div><span className="text-slate-500">Total payments</span><p className="font-medium text-slate-900">{money(detail.contract.total_lease_payments_cents)}</p></div>
            <div><span className="text-slate-500">Commencement JE</span><p>{detail.contract.commencement_je_id ? <EntityLink kind="journal_entry" id={detail.contract.commencement_je_id} label="Open journal entry" /> : "—"}</p></div>
          </section>
          <section><h2 className="mb-2 text-sm font-semibold text-slate-900">Linked assets</h2><ParityTable columns={assetColumns} rows={detail.assets} rowKey={(row) => row.id} storageKey="accounting-lease-assets" tableTestId="accounting-lease-assets-table" emptyText="No active assets linked to this lease." /></section>
          <section><h2 className="mb-2 text-sm font-semibold text-slate-900">Schedule</h2><ParityTable columns={scheduleColumns} rows={detail.schedule} rowKey={(row) => String(row.period_number)} storageKey="accounting-lease-schedule" tableTestId="accounting-lease-schedule-table" emptyText="No active schedule rows for this lease." /></section>
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
