/**
 * Row 82 (11-03 register) — Reports › Customer report, board docs/design/v3/V3-Reports-Customers.dc.html.
 * Sales / open balances: GET /api/v1/mdata/boards/customers (party-board.service.ts readCustomerBoard — accounting.invoices,
 * collected = payment applications). Aging detail + Open A/R KPI: GET /api/v1/reports/ar-aging (the canonical aging that ties
 * to GL 1100). Statement: each customer opens its existing statement page (/customers/:id/statement). No new engine.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getArAgingReport,
  getCustomerBoardReport,
  type ARAgingRow,
  type CustomerBoardReportRow,
  type PartyBoardRange,
} from "../../../api/reports";
import { EntityMultiSelect, entityFilterIds } from "../../../components/EntityMultiSelect";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { companyToday } from "../../../lib/businessDate";
import { formatCompanyName } from "../../../lib/formatCompanyName";
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsdCents } from "../../../lib/money";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { ReportBoardShell, ReportKpiGrid, ReportMeasuredNote } from "./ReportBoardShell";
import { pct, pctLabel, sumBy } from "./reportBoardGroup";

type View = "sales" | "open" | "aging" | "statement";
const VIEW_OPTIONS: Array<{ id: View; label: string }> = [
  { id: "sales", label: "Sales by customer" },
  { id: "open", label: "Open balances" },
  { id: "aging", label: "Aging detail" },
  { id: "statement", label: "Statement" },
];
const FACTORED_OPTIONS = [
  { value: "factored", label: "Factored" },
  { value: "not_factored", label: "Not factored" },
];
const RANGE_OPTIONS: Array<{ id: PartyBoardRange; label: string }> = [
  { id: "ytd", label: "YTD" },
  { id: "12m", label: "Last 12 months" },
  { id: "all", label: "All time" },
];

const money = (cents: number) => formatUsdCents(cents);
const pastDue = (r: CustomerBoardReportRow) => r.aging.d1_30 + r.aging.d31_60 + r.aging.d61_90 + r.aging.d90_plus;
const name = (n: string | null | undefined) => (n ? formatCompanyName(n) : "Customer");

export function CustomerReportBoard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [range, setRange] = useState<PartyBoardRange>("ytd");
  const [view, setView] = useState<View>("sales");
  const [customerIds, setCustomerIds] = useState("");
  const [factored, setFactored] = useState<string[]>([]);
  const asOf = companyToday();

  const board = useQuery({
    queryKey: ["reports", "customer-board", companyId, range],
    queryFn: () => getCustomerBoardReport(companyId, range),
    enabled: Boolean(companyId),
    retry: false,
  });
  const aging = useQuery({
    queryKey: ["reports", "customer-board-aging", companyId, asOf],
    queryFn: () => getArAgingReport(companyId, asOf),
    enabled: Boolean(companyId),
    retry: false,
  });

  const ids = entityFilterIds(customerIds);
  const rows = useMemo(
    () =>
      (board.data?.rows ?? [])
        .filter((r) => !ids.length || ids.includes(r.id))
        .filter((r) => !factored.length || factored.includes(r.factored != null ? "factored" : "not_factored")),
    [board.data?.rows, ids.join(","), factored]
  );
  const billedRows = useMemo(() => rows.filter((r) => r.invoices > 0).sort((a, b) => b.billed_cents - a.billed_cents), [rows]);
  const openRows = useMemo(() => rows.filter((r) => r.open_cents > 0).sort((a, b) => b.open_cents - a.open_cents), [rows]);
  const agingRows = useMemo(() => (aging.data?.rows ?? []).filter((r) => !ids.length || ids.includes(r.customer_id)), [aging.data?.rows, ids.join(",")]);

  const billed = sumBy(billedRows, (r) => r.billed_cents);
  const agingTotals = {
    current: sumBy(agingRows, (r) => r.current_cents),
    d1_30: sumBy(agingRows, (r) => r.bucket_1_30_cents),
    d31_60: sumBy(agingRows, (r) => r.bucket_31_60_cents),
    d61_90: sumBy(agingRows, (r) => r.bucket_61_90_cents),
    d90: sumBy(agingRows, (r) => r.bucket_91_plus_cents),
    total: sumBy(agingRows, (r) => r.total_open_cents),
    invoices: sumBy(agingRows, (r) => r.open_invoice_count),
  };
  const pastDueAr = agingTotals.total - agingTotals.current;

  const customerCell = (r: { id: string; name: string }) => <EntityLink kind="customer" id={r.id} label={name(r.name)} />;

  const salesColumns: ParityColumn<CustomerBoardReportRow>[] = [
    { key: "name", label: "Customer", sortable: true, render: customerCell },
    { key: "invoices", label: "Invoices", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => String(r.invoices) },
    { key: "billed_cents", label: "Billed", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.billed_cents) },
    { key: "share", label: "% of sales", sortable: true, sortValue: (r) => r.billed_cents, cellClass: "text-right", className: "text-right", render: (r) => pctLabel(pct(r.billed_cents, billed)) },
    {
      key: "avg",
      label: "Avg / invoice",
      sortable: true,
      sortValue: (r) => (r.invoices ? r.billed_cents / r.invoices : 0),
      cellClass: "text-right",
      className: "text-right",
      render: (r) => (r.invoices ? money(Math.round(r.billed_cents / r.invoices)) : "—"),
    },
    { key: "collected_cents", label: "Collected", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.collected_cents) },
    { key: "open_cents", label: "Open", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.open_cents) },
    { key: "past_due", label: "Past due", sortable: true, sortValue: pastDue, cellClass: "text-right", className: "text-right", render: (r) => (pastDue(r) ? money(pastDue(r)) : "—") },
    { key: "factored", label: "Factored", sortable: true, render: (r) => r.factored ?? "—" },
    { key: "last_invoice", label: "Last invoice", sortable: true, render: (r) => formatDateUS(r.last_invoice) || "—" },
  ];

  const openColumns: ParityColumn<CustomerBoardReportRow>[] = [
    { key: "name", label: "Customer", sortable: true, render: customerCell },
    { key: "open_cents", label: "Open", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.open_cents) },
    { key: "current", label: "Current", sortable: true, sortValue: (r) => r.aging.current, cellClass: "text-right", className: "text-right", render: (r) => money(r.aging.current) },
    { key: "past_due", label: "Past due", sortable: true, sortValue: pastDue, cellClass: "text-right", className: "text-right", render: (r) => money(pastDue(r)) },
    { key: "factored", label: "Factored", sortable: true, render: (r) => r.factored ?? "—" },
    {
      key: "invoices_link",
      label: "Invoices",
      render: (r) => (
        <Link className="text-[#1D4ED8] hover:underline" to={`/accounting/invoices?customer_id=${encodeURIComponent(r.id)}&live_open=true`}>
          Open invoices
        </Link>
      ),
    },
    {
      key: "statement",
      label: "Statement",
      render: (r) => (
        <Link className="text-[#1D4ED8] hover:underline" to={`/customers/${encodeURIComponent(r.id)}/statement`}>
          Statement
        </Link>
      ),
    },
  ];

  const agingColumns: ParityColumn<ARAgingRow>[] = [
    { key: "customer_name", label: "Customer", sortable: true, render: (r) => <EntityLink kind="customer" id={r.customer_id} label={name(r.customer_name)} /> },
    { key: "open_invoice_count", label: "Invoices", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => String(r.open_invoice_count) },
    { key: "current_cents", label: "Current", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.current_cents) },
    { key: "bucket_1_30_cents", label: "1–30", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.bucket_1_30_cents) },
    { key: "bucket_31_60_cents", label: "31–60", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.bucket_31_60_cents) },
    { key: "bucket_61_90_cents", label: "61–90", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.bucket_61_90_cents) },
    { key: "bucket_91_plus_cents", label: "90+", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.bucket_91_plus_cents) },
    { key: "total_open_cents", label: "Total", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.total_open_cents) },
  ];

  const statementColumns: ParityColumn<CustomerBoardReportRow>[] = [
    { key: "name", label: "Customer", sortable: true, render: customerCell },
    { key: "invoices", label: "Invoices", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => String(r.invoices) },
    { key: "billed_cents", label: "Billed", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.billed_cents) },
    { key: "collected_cents", label: "Payments", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.collected_cents) },
    { key: "open_cents", label: "Balance", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.open_cents) },
    {
      key: "statement",
      label: "Statement",
      render: (r) => (
        <Link className="font-semibold text-[#1D4ED8] hover:underline" to={`/customers/${encodeURIComponent(r.id)}/statement`} data-testid={`customer-report-statement-${r.id}`}>
          Open statement →
        </Link>
      ),
    },
  ];

  const xlsx = () => {
    if (view === "aging") {
      return {
        filename: "customer-report-aging",
        header: ["Customer", "Invoices", "Current", "1-30", "31-60", "61-90", "90+", "Total"],
        body: agingRows.map((r) => [
          name(r.customer_name),
          r.open_invoice_count,
          r.current_cents / 100,
          r.bucket_1_30_cents / 100,
          r.bucket_31_60_cents / 100,
          r.bucket_61_90_cents / 100,
          r.bucket_91_plus_cents / 100,
          r.total_open_cents / 100,
        ]),
      };
    }
    const list = view === "open" ? openRows : billedRows;
    return {
      filename: `customer-report-${view}`,
      header: ["Customer", "Invoices", "Billed", "Collected", "Open", "Past due", "Factored", "Last invoice"],
      body: list.map((r) => [name(r.name), r.invoices, r.billed_cents / 100, r.collected_cents / 100, r.open_cents / 100, pastDue(r) / 100, r.factored ?? "", formatDateUS(r.last_invoice)]),
    };
  };

  const factoredCount = billedRows.filter((r) => r.factored != null).length;

  return (
    <ReportBoardShell
      id="customer-report"
      subtitle="sales, receivables and aging by customer · accrual · source: invoices (open A/R from the canonical A/R aging, GL 1100)"
      xlsx={xlsx}
    >
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-[#E5E7EB] bg-white px-3 py-2 text-xs" data-testid="customer-report-filters">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-[#4B5563]">Invoiced</span>
          <V3Segmented value={range} options={RANGE_OPTIONS} onChange={setRange} testId="customer-report-range" />
        </label>
        <label className="flex min-w-[12rem] flex-col gap-1 text-[#4B5563]">
          <span className="font-semibold">Customer</span>
          <EntityMultiSelect
            kind="customer"
            operatingCompanyId={companyId}
            value={customerIds || null}
            onChange={(next) => setCustomerIds(next ?? "")}
            placeholder="All customers"
          />
        </label>
        <MultiSelectDropdown
          label="Factored"
          options={FACTORED_OPTIONS}
          selected={factored}
          onChange={setFactored}
          allLabel="Factored: all"
          data-testid="customer-report-factored-filter"
        />
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-[#4B5563]">View</span>
          <V3Segmented value={view} options={VIEW_OPTIONS} onChange={setView} testId="customer-report-view" />
        </label>
      </div>

      {board.isError ? <ListErrorState title="Couldn't load the customer report" {...formatQueryErrorDetail(board.error)} onRetry={() => void board.refetch()} /> : null}
      {aging.isError ? <ListErrorState title="Couldn't load A/R aging" {...formatQueryErrorDetail(aging.error)} onRetry={() => void aging.refetch()} /> : null}

      <ReportKpiGrid>
        <V3KpiTile
          testId="cr-kpi-customers"
          label="Customers billed"
          value={board.data ? String(billedRows.length) : "…"}
          sub={`${sumBy(billedRows, (r) => r.invoices)} invoices`}
          onClick={() => setView("sales")}
        />
        <V3KpiTile testId="cr-kpi-billed" label="Billed" value={board.data ? money(billed) : "…"} onClick={() => setView("sales")} />
        <V3KpiTile
          testId="cr-kpi-open-ar"
          label="Open A/R"
          value={aging.data ? money(agingTotals.total) : "…"}
          sub={`${agingTotals.invoices} invoices · as of ${formatDateUS(asOf)}`}
          onClick={() => setView("aging")}
        />
        <V3KpiTile
          testId="cr-kpi-past-due"
          label="Past due"
          value={aging.data ? money(pastDueAr) : "…"}
          sub={`${pctLabel(pct(pastDueAr, agingTotals.total))} of open`}
          tone={pastDueAr ? "amber" : "muted"}
          onClick={() => setView("aging")}
        />
        <V3KpiTile testId="cr-kpi-factored" label="Customers with factored invoices" value={board.data ? String(factoredCount) : "…"} onClick={() => setFactored(["factored"])} />
        <V3KpiTile
          testId="cr-kpi-collected"
          label="Payments recorded"
          value={board.data ? money(sumBy(billedRows, (r) => r.collected_cents)) : "…"}
          sub={`${sumBy(billedRows, (r) => r.paid_invoices)} invoices with a payment`}
          onClick={() => setView("statement")}
        />
      </ReportKpiGrid>

      {view === "sales" ? (
        <ParityTable
          rows={billedRows}
          title={`Sales by customer · ${billedRows.length} customers`}
          columns={salesColumns}
          rowKey={(r) => r.id}
          loading={board.isPending}
          storageKey="customer-report-sales"
          emptyText="No invoices in this range."
          exportFilename="customer-report-sales"
          exportExcel
          footerCells={{
            name: <span className="font-semibold text-[#111827]">Totals ({billedRows.length})</span>,
            invoices: String(sumBy(billedRows, (r) => r.invoices)),
            billed_cents: money(billed),
            collected_cents: money(sumBy(billedRows, (r) => r.collected_cents)),
            open_cents: money(sumBy(billedRows, (r) => r.open_cents)),
            past_due: money(sumBy(billedRows, pastDue)),
          }}
        />
      ) : null}
      {view === "open" ? (
        <ParityTable
          rows={openRows}
          title={`Open balances · ${openRows.length} customers`}
          columns={openColumns}
          rowKey={(r) => r.id}
          loading={board.isPending}
          storageKey="customer-report-open"
          emptyText="No open balances."
          exportFilename="customer-report-open"
          exportExcel
          footerCells={{
            name: <span className="font-semibold text-[#111827]">Totals ({openRows.length})</span>,
            open_cents: money(sumBy(openRows, (r) => r.open_cents)),
            current: money(sumBy(openRows, (r) => r.aging.current)),
            past_due: money(sumBy(openRows, pastDue)),
          }}
        />
      ) : null}
      {view === "aging" ? (
        <ParityTable
          rows={agingRows}
          title={`A/R aging · as of ${formatDateUS(asOf)} · by due date`}
          columns={agingColumns}
          rowKey={(r) => r.customer_id}
          loading={aging.isPending}
          storageKey="customer-report-aging"
          emptyText="No open receivables."
          exportFilename="customer-report-aging"
          exportExcel
          footerCells={{
            customer_name: <span className="font-semibold text-[#111827]">Totals ({agingRows.length})</span>,
            open_invoice_count: String(agingTotals.invoices),
            current_cents: money(agingTotals.current),
            bucket_1_30_cents: money(agingTotals.d1_30),
            bucket_31_60_cents: money(agingTotals.d31_60),
            bucket_61_90_cents: money(agingTotals.d61_90),
            bucket_91_plus_cents: money(agingTotals.d90),
            total_open_cents: money(agingTotals.total),
          }}
        />
      ) : null}
      {view === "statement" ? (
        <ParityTable
          rows={billedRows}
          title="Customer statements — invoices, payments, balance"
          columns={statementColumns}
          rowKey={(r) => r.id}
          loading={board.isPending}
          storageKey="customer-report-statement"
          emptyText="No customers billed in this range."
          exportFilename="customer-report-statement"
          exportExcel
        />
      ) : null}

      {board.data && aging.data ? (
        <ReportMeasuredNote>
          Open on the customer invoices: {money(sumBy(rows, (r) => r.open_cents))} (every live invoice, drafts and proforma
          included); canonical A/R aging: {money(agingTotals.total)}. Payments recorded in range:{" "}
          {money(sumBy(billedRows, (r) => r.collected_cents))}. Each customer opens its profile; each statement lists its invoices, payments and balance.
        </ReportMeasuredNote>
      ) : null}
    </ReportBoardShell>
  );
}
