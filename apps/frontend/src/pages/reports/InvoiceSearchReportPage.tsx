import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { listInvoices, type Invoice } from "../../api/accounting";
import { ReportsSubNav } from "./ReportsSubNav";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { formatPlannerDayLabel } from "../dispatch/planners/plannerDayLabel";
import { useUrlSort } from "../../hooks/useUrlSort";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { EntityLink } from "../../components/shared/EntityLink";

import { formatUsdCents } from "../../lib/money";

function mmmDd(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatPlannerDayLabel(iso.slice(0, 10));
}

function money(cents: number): string {
  if (!cents) return "—";
  return formatUsdCents(cents);
}

function isVoidInvoice(row: Pick<Invoice, "status" | "voided_at">): boolean {
  return row.status === "void" || Boolean(row.voided_at);
}

function invoiceStatusBadge(row: Pick<Invoice, "status" | "voided_at">) {
  if (isVoidInvoice(row)) return <StatusBadge variant="neutral">voided</StatusBadge>;
  const variant =
    row.status === "paid" ? "positive"
    : row.status === "draft" ? "info"
    : row.status === "partial" ? "warn"
    : row.status === "factored" ? "info"
    : "neutral";
  return <StatusBadge variant={variant}>{row.status}</StatusBadge>;
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active (hide voided)" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "factored", label: "Factored" },
  { value: "void", label: "Void" },
];

export function InvoiceSearchReportPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [dateRange, setDateRange] = useState("all");

  const invoicesQ = useQuery({
    queryKey: ["reports", "invoice-search", operatingCompanyId, search, statusFilter, sortKey, sortDirection],
    enabled: Boolean(operatingCompanyId),
    queryFn: () =>
      listInvoices(operatingCompanyId, {
        search: search || undefined,
        status: statusFilter || undefined,
        sort: sortKey || undefined,
        dir: sortDirection || undefined,
        limit: 100,
        offset: 0,
      }),
  });

  const rows = invoicesQ.data?.invoices ?? [];
  const total = invoicesQ.data?.total ?? 0;

  const columns = useMemo<ParityColumn<Invoice>[]>(() => [
    {
      key: "display_id",
      label: "Invoice #",
      sortable: true,
      render: (r) => <span className="font-mono font-medium text-gray-900">{r.display_id}</span>,
    },
    {
      key: "customer_name",
      label: "Customer",
      sortable: true,
      sortValue: (r) => r.customer_name ?? "",
      render: (r) =>
        r.customer_id ? (
          <EntityLink kind="customer" id={r.customer_id} label={r.customer_name ?? "Customer"} className="font-medium text-gray-800" />
        ) : (
          <span className="text-gray-500">{r.customer_name ?? "—"}</span>
        ),
    },
    {
      key: "source_load_number",
      label: "Load",
      sortable: true,
      sortValue: (r) => r.source_load_number ?? "",
      render: (r) => <span className="font-mono text-gray-600">{r.source_load_number ?? "—"}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => invoiceStatusBadge(r),
    },
    {
      key: "issue_date",
      label: "Issued",
      sortable: true,
      sortValue: (r) => r.issue_date,
      render: (r) => <span className="text-gray-700">{mmmDd(r.issue_date)}</span>,
    },
    {
      key: "due_date",
      label: "Due",
      sortable: true,
      sortValue: (r) => r.due_date,
      render: (r) => <span className="text-gray-700">{mmmDd(r.due_date)}</span>,
    },
    {
      key: "total_cents",
      label: "Total",
      sortable: true,
      className: "text-right",
      cellClass: "text-right font-mono",
      render: (r) => <span>{money(r.total_cents)}</span>,
    },
    {
      key: "amount_open_cents",
      label: "Open",
      sortable: true,
      className: "text-right",
      cellClass: "text-right font-mono",
      render: (r) => <span>{isVoidInvoice(r) ? "—" : money(r.amount_open_cents)}</span>,
    },
    {
      key: "factoring_status",
      label: "Factoring",
      sortable: true,
      sortValue: (r) => r.factoring_status ?? "",
      render: (r) => <span className="text-gray-600">{r.factoring_status && r.factoring_status !== "not_factored" ? r.factoring_status : "—"}</span>,
    },
  ], []);

  if (!operatingCompanyId) {
    return (
      <div>
        <ReportsSubNav />
        <PageHeader title="Invoice Search" subtitle="Search invoices via server-side query builder" />
        <div className="px-4 pb-6 text-xs text-slate-600">Select an operating company to search invoices.</div>
      </div>
    );
  }

  return (
    <div>
      <ReportsSubNav />
      <PageHeader
        title="Invoice Search"
        subtitle="Server-side search · sortable · MMM-DD dates"
      />
      <div className="flex justify-end px-4">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Print
        </button>
      </div>
      <div className="px-4 pb-6">
        {/* Search + filter bar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice #, customer, load #…"
            className="h-7 w-64 rounded-sm border border-gray-300 px-2 text-xs"
            data-testid="invoice-search-input"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-7 rounded-sm border border-gray-300 px-2 text-xs"
            data-testid="invoice-search-status"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="h-7 rounded-sm border border-gray-300 px-2 text-xs"
            data-testid="invoice-search-date-range"
            // TODO: wire to backend filter
          >
            <option value="all">All time</option>
            <option value="last_30">Last 30 days</option>
            <option value="last_90">Last 90 days</option>
            <option value="this_year">This year</option>
          </select>
          <span className="text-xs text-gray-500">{total} result{total === 1 ? "" : "s"}</span>
        </div>

        {invoicesQ.isError ? (
          <ListErrorState
            title="Couldn't load invoices"
            status={0}
            message={(invoicesQ.error as Error)?.message}
            onRetry={() => void invoicesQ.refetch()}
          />
        ) : (
          <ParityTable<Invoice>
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            loading={invoicesQ.isLoading}
            storageKey="invoice-search-report"
            tableTestId="invoice-search-report-table"
            emptyText="No invoices match your search."
            exportFilename="invoice-search-report.csv"
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
            initialPageSize={50}
          />
        )}
      </div>
    </div>
  );
}
