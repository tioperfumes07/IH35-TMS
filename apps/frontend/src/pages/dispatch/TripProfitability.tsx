/**
 * TripProfitability — Company Settlement Report / Trip Profitability view.
 *
 * Lane B (Block 9) owns this file.
 * Lane A (Block 12) registers the route in manifest.tsx:
 *   <Route path="/reports/trip-profitability" element={<TripProfitability />} />
 *
 * Data: GET /api/v1/reports/trip-profitability
 * One row per settlement period with every linked load (5753 model).
 * Read-only. No new financial code.
 */
import { useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { getTripProfitability, type TripProfitabilityRow } from "../../lib/loadProfit";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters } from "../../components/table";
import { ReportsSubNav } from "../reports/ReportsSubNav";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";

function money(cents: number) {
  return formatUsdCents(cents);
}

function currentQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function marginClass(pct: number) {
  if (pct < 0) return "text-red-600 font-semibold";
  if (pct < 10) return "text-slate-700";
  return "text-green-700";
}

export function TripProfitability() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);

  const query = useQuery({
    queryKey: ["reports", "trip-profitability", companyId, applied.start, applied.end],
    queryFn: () =>
      getTripProfitability({ operating_company_id: companyId, from: applied.start, to: applied.end }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const rows = query.isError ? [] : (query.data?.rows ?? []);
  const t = query.isError ? undefined : query.data?.totals;

  // Migrated to the shared QBO-parity grid — columns, order, and margin coloring preserved
  // verbatim (§7 additive-only).
  const columns: Array<ParityColumn<TripProfitabilityRow>> = [
    {
      key: "settlement_display_id",
      label: "Settlement #",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs">
          <EntityLinkOrTombstone kind="settlement" id={row.settlement_id} name={row.settlement_display_id} noun="Settlement" />
        </span>
      ),
    },
    {
      key: "period_start",
      label: "Period",
      sortable: true,
      sortValue: (row) => row.period_start,
      render: (row) => <>{formatDateUS(row.period_start)} → {formatDateUS(row.period_end)}</>,
    },
    {
      key: "driver_name",
      label: "Driver",
      sortable: true,
      render: (row) => <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" />,
    },
    {
      key: "load_links",
      label: "Loads",
      sortable: true,
      sortValue: (row) => row.load_links.length,
      render: (row) => (
        <span className="flex flex-wrap gap-1 font-mono text-xs">
          {row.load_links.length === 0 ? <span className="text-slate-500">No linked loads</span> : row.load_links.map((load) => (
            <EntityLinkOrTombstone key={load.id} kind="load" id={load.id} name={load.label} noun="Load" />
          ))}
        </span>
      ),
    },
    {
      key: "quick_pay_cents",
      label: "Quick Pay",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => money(row.quick_pay_cents),
    },
    {
      key: "revenue_cents",
      label: "Revenue",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => money(row.revenue_cents),
    },
    {
      key: "driver_pay_cents",
      label: "Driver Pay",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => money(row.driver_pay_cents),
    },
    {
      key: "additional_driver_pay_cents",
      label: "Additional Driver Pay",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => money(row.additional_driver_pay_cents),
    },
    {
      key: "fuel_cents",
      label: "Fuel",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => money(row.fuel_cents),
    },
    {
      key: "company_expenses_cents",
      label: "Company Expenses",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => money(row.company_expenses_cents),
    },
    {
      key: "net_profit_cents",
      label: "Net Revenue",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => <span className={marginClass(row.margin_pct)}>{money(row.net_profit_cents)}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => row.status,
    },
    {
      key: "margin_pct",
      label: "Margin %",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => <span className={marginClass(row.margin_pct)}>{row.margin_pct.toFixed(1)}%</span>,
    },
    {
      key: "trip_closed_at",
      label: "Closed",
      sortable: true,
      render: (row) => (row.trip_closed_at ? new Date(row.trip_closed_at).toLocaleDateString() : "Open"),
    },
  ];

  const filterBar = (
    <CollapsedListFilters
      activeFilterCount={period.start || period.end ? 1 : 0}
      onApply={() => setApplied(period)}
      onReset={() => setPeriod(currentQuarterRange)}
      onCancel={() => setPeriod(applied)}
      applyDisabled={period.start === applied.start && period.end === applied.end}
      testIdPrefix="trip-profit"
      dataAttributes={{ "data-trip-profit-filter-toolbar": "collapsed" }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="trip-profit-from" className="text-sm">
            From
          </label>
          <DatePicker
            id="trip-profit-from"
            className="ml-2"
            value={period.start}
            onChange={(next) => setPeriod((p) => ({ ...p, start: next }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="trip-profit-to" className="text-sm">
            To
          </label>
          <DatePicker
            id="trip-profit-to"
            className="ml-2"
            value={period.end}
            onChange={(next) => setPeriod((p) => ({ ...p, end: next }))}
          />
        </div>
      </div>
    </CollapsedListFilters>
  );

  return (
    <div className="space-y-3">
      <ReportsSubNav />
      <PageHeader title="Company Settlements" subtitle="One settlement period, every linked load, P&L tied to the cent" />

      {/* State messages */}
      {query.isError && (
        <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load trip profitability.{" "}
          <button type="button" className="underline" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      )}

      {/* Totals cards */}
      {t && (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
          {[
            { label: "Settlements", value: String(t.settlement_count) },
            { label: "Revenue", value: money(t.revenue_cents) },
            { label: "Quick pay", value: money(t.quick_pay_cents) },
            { label: "Driver pay", value: money(t.driver_pay_cents + t.additional_driver_pay_cents) },
            {
              label: "Net profit",
              value: money(t.net_profit_cents),
              highlight: t.net_profit_cents < 0 ? "text-red-600" : "text-green-700",
            },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="rounded-sm border bg-white p-3">
              <div className="text-xs text-slate-500">{label}</div>
              <div className={`text-lg font-semibold ${highlight ?? "text-slate-900"}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <ParityTable<TripProfitabilityRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.settlement_id}
        loading={query.isLoading}
        emptyText="No company settlements in this period."
        storageKey="company-settlements-period-grid"
        exportFilename="company-settlements"
        filterBar={filterBar}
      />
    </div>
  );
}
