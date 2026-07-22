import { formatDateUS } from "../../lib/formatDate";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getVendorBill, type BillDetailLine, type BillPayment } from "../../api/accounting";
import { ListErrorState } from "../../components/ListErrorState";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusVariant(status: string): "positive" | "neutral" | "crit" | "warn" {
  if (status === "paid") return "positive";
  if (status === "voided") return "neutral";
  if (status === "partial") return "warn";
  return "crit";
}

function accountLabel(number: string | null | undefined, name: string | null | undefined, id: string) {
  if (number && name) return `${number} — ${name}`;
  if (name) return name;
  if (number) return number;
  return id.slice(0, 8);
}

export function BillDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  // BANK-SORT-ROLLOUT-ACCT: payments grid sort persists in URL (?sort=&dir=).
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  const detailQuery = useQuery({
    queryKey: ["accounting", "bill", selectedCompanyId, id],
    queryFn: () => getVendorBill(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  if (detailQuery.isLoading) return <div className="p-4 text-sm text-slate-500">Loading bill…</div>;
  if (detailQuery.isError)
    return (
      <ListErrorState
        title="Couldn't load bill"
        status={0}
        message={(detailQuery.error as Error | undefined)?.message}
        onRetry={() => void detailQuery.refetch()}
      />
    );

  const bill = detailQuery.data?.bill;
  const lines = detailQuery.data?.lines ?? [];
  const payments = detailQuery.data?.payments ?? [];

  if (!bill) return <div className="p-4 text-sm text-red-600">Bill not found.</div>;

  const displayId = bill.bill_number ?? bill.id.slice(0, 8);
  const balance = Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0);

  const lineColumns: Array<ParityColumn<BillDetailLine>> = [
    { key: "line_sequence", label: "Line", sortable: true, render: (line) => line.line_sequence },
    {
      key: "account_id",
      label: "GL account",
      sortable: true,
      sortValue: (line) => line.account_name ?? line.account_id ?? "",
      render: (line) =>
        line.account_id ? (
          <Link
            to={`/accounting/chart-of-accounts/register/${line.account_id}`}
            className="text-slate-700 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {accountLabel(line.account_number, line.account_name, line.account_id)}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
      render: (line) => line.description || "—",
    },
    {
      key: "load_id",
      label: "Load",
      sortable: true,
      sortValue: (line) => line.load_number ?? line.load_id ?? "",
      render: (line) =>
        line.load_id ? (
          <EntityLink kind="load" id={line.load_id} label={line.load_number ?? line.load_id.slice(0, 8)} />
        ) : (
          "—"
        ),
    },
    {
      key: "amount_cents",
      label: "Amount",
      sortable: true,
      className: "text-right",
      cellClass: "text-right tabular-nums",
      render: (line) => money(line.amount_cents),
    },
  ];

  // QBO-parity grid — columns, order, and content preserved verbatim from the former hand-rolled table.
  const paymentColumns: Array<ParityColumn<BillPayment>> = [
    { key: "payment_date", label: "Date", sortable: true, render: (pmt) => formatDateUS(pmt.payment_date) },
    { key: "amount_cents", label: "Amount", sortable: true, render: (pmt) => money(pmt.amount_cents) },
    { key: "payment_method", label: "Method", sortable: true },
    { key: "reference_number", label: "Reference", render: (pmt) => pmt.reference_number ?? "—" },
    { key: "check_number", label: "Check #", render: (pmt) => pmt.check_number ?? "—" },
    {
      key: "is_reconciled",
      label: "Reconciled",
      render: (pmt) =>
        pmt.is_reconciled ? <span className="text-slate-600">✓ Matched</span> : <span className="text-slate-400">—</span>,
    },
  ];

  return (
    <AccountingSubNavWrapper>
      <PageHeader
        title={displayId}
        backHref="/accounting/bills"
        breadcrumb={[
          { label: "Accounting", href: "/accounting" },
          { label: "Bills", href: "/accounting/bills" },
          { label: displayId },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge variant={statusVariant(bill.status)}>{bill.status}</StatusBadge>
            {bill.is_reconciled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Matched
              </span>
            ) : null}
          </div>
        }
      />

      <DataPanel title="Bill">
        {bill.vendor_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Vendor</span>
            <EntityLink kind="vendor" id={bill.vendor_id} label={bill.vendor_name ?? bill.vendor_id.slice(0, 8)} />
          </DataPanelRow>
        ) : null}
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Bill #</span>
          <span className="text-sm text-gray-900">{bill.bill_number ?? "—"}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Bill date</span>
          <span className="text-sm text-gray-900">{formatDateUS(bill.bill_date)}</span>
        </DataPanelRow>
        {bill.due_date ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Due date</span>
            <span className="text-sm text-gray-900">{formatDateUS(bill.due_date)}</span>
          </DataPanelRow>
        ) : null}
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Amount</span>
          <span className="text-sm text-gray-900">{money(bill.amount_cents)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Paid</span>
          <span className="text-sm text-gray-900">{money(bill.paid_cents)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Open balance</span>
          <span className="text-sm font-semibold text-gray-900">{money(balance)}</span>
        </DataPanelRow>
        {bill.journal_entry_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Journal entry</span>
            <EntityLink kind="journal_entry" id={bill.journal_entry_id} label={bill.journal_entry_id.slice(0, 8)} />
          </DataPanelRow>
        ) : null}
        {bill.unit_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Unit</span>
            <EntityLink kind="unit" id={bill.unit_id} label={bill.unit_id.slice(0, 8)} />
          </DataPanelRow>
        ) : null}
        {bill.linked_work_order_uuid ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Work order</span>
            <EntityLink kind="work_order" id={bill.linked_work_order_uuid} label={bill.linked_work_order_uuid.slice(0, 8)} />
          </DataPanelRow>
        ) : null}
        {bill.memo ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Memo</span>
            <span className="text-sm text-gray-900">{bill.memo}</span>
          </DataPanelRow>
        ) : null}
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Created</span>
          <span className="text-sm text-gray-900">{formatDateUS(bill.created_at)}</span>
        </DataPanelRow>
      </DataPanel>

      <DataPanel title="Lines">
        <div data-testid="bill-detail-lines">
        <ParityTable<BillDetailLine>
          columns={lineColumns}
          rows={lines}
          rowKey={(line) => line.id}
          loading={detailQuery.isFetching && !detailQuery.data}
          emptyText="No bill lines."
          density="compact"
          storageKey="bill-detail-lines"
        />
        </div>
      </DataPanel>

      <DataPanel title="Payments">
        <ParityTable<BillPayment>
          columns={paymentColumns}
          rows={payments}
          rowKey={(pmt) => pmt.id}
          loading={detailQuery.isFetching && !detailQuery.data}
          emptyText="No payments recorded."
          density="compact"
          storageKey="bill-detail-payments"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
        />
      </DataPanel>
    </AccountingSubNavWrapper>
  );
}
