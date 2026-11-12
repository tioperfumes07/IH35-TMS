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
import { BoardSection } from "../../components/v3/BoardSection";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { CollapsedListFilters } from "../../components/table";
import { ReportsSubNav } from "../reports/ReportsSubNav";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { formatQuantityTable, formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";

function settlementMoney(cents: number, settlementId: string) {
  return (
    <MoneyCell cents={Number(cents ?? 0)} drill={{ entity: { kind: "settlement", id: settlementId } }} />
  );
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
  if (pct < 10) return "text-[#1F2A44]";
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
      key: "first_load_id",
      label: "Loads",
      sortable: true,
      sortValue: (row) => row.first_load_number ?? "",
      render: (row) => <EntityLinkOrTombstone kind="load" id={row.first_load_id} name={row.first_load_number} noun="Load" />,
    },
    {
      key: "load_links",
      label: "All Loads",
      sortable: true,
      sortValue: (row) => row.load_links.length,
      render: (row) => (
        <span className="flex flex-wrap gap-1 font-mono text-xs">
          {row.load_links.length === 0 ? <span className="text-[#6B7280]">No linked loads</span> : row.load_links.map((load) => (
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
      render: (row) => settlementMoney(row.quick_pay_cents, row.settlement_id),
    },
    {
      key: "revenue_cents",
      label: "Revenue",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => settlementMoney(row.revenue_cents, row.settlement_id),
    },
    {
      key: "driver_pay_cents",
      label: "Driver Pay",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => settlementMoney(row.driver_pay_cents, row.settlement_id),
    },
    {
      key: "additional_driver_pay_cents",
      label: "Additional Driver Pay",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => settlementMoney(row.additional_driver_pay_cents, row.settlement_id),
    },
    {
      key: "fuel_cents",
      label: "Fuel",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => settlementMoney(row.fuel_cents, row.settlement_id),
    },
    {
      key: "company_expenses_cents",
      label: "Company Expenses",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => settlementMoney(row.company_expenses_cents, row.settlement_id),
    },
    {
      key: "net_profit_cents",
      label: "Net Revenue",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => (
        <MoneyCell
          cents={Number(row.net_profit_cents ?? 0)}
          className={marginClass(row.margin_pct)}
          drill={{ entity: { kind: "settlement", id: row.settlement_id } }}
        />
      ),
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
      render: (row) => <span className={marginClass(row.margin_pct)}>{formatQuantityTable(row.margin_pct, 1)}%</span>,
    },
    {
      key: "trip_closed_at",
      label: "Closed",
      sortable: true,
      render: (row) => (row.trip_closed_at ? formatDateUS(row.trip_closed_at) || "—" : "Open"),
    },
  ];

  if (!companyId) {
    return (
      <div className="space-y-3 p-4" data-testid="trip-profitability-page">
        <ReportsSubNav />
        <PageHeader
          backHref="/dispatch"
          title="Company Settlements"
          subtitle="One settlement period, every linked load, P&L tied to the cent"
        />
        <BoardSection title="Company settlements" testId="trip-profitability-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company.</p>
        </BoardSection>
      </div>
    );
  }

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
          <label htmlFor="trip-profit-from" className="text-xs">
            From
          </label>
          <DatePicker box="filter"
            id="trip-profit-from"
            className="ml-2"
            value={period.start}
            onChange={(next) => setPeriod((p) => ({ ...p, start: next }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="trip-profit-to" className="text-xs">
            To
          </label>
          <DatePicker box="filter"
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
    <div className="space-y-3" data-testid="trip-profitability-page">
      <ReportsSubNav />
      <PageHeader backHref="/dispatch" title="Company Settlements" subtitle="One settlement period, every linked load, P&L tied to the cent" />

      {/* State messages */}
      {query.isError && (
        <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          Failed to load trip profitability.{" "}
          <button type="button" className="underline" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      )}

      {/* Totals — period population is the company-settlements list (same engine rows below). */}
      {t && (
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-5" data-testid="trip-profitability-kpi-strip">
          <V3KpiTile
            label="Settlements"
            value={formatQuantityTable(t.settlement_count, 0)}
            href="/driver-finance/company-settlements"
            testId="trip-profit-kpi-settlements"
          />
          <V3KpiTile
            label="Revenue"
            value={formatUsdCents(t.revenue_cents)}
            href="/driver-finance/company-settlements"
            testId="trip-profit-kpi-revenue"
          />
          <V3KpiTile
            label="Quick pay"
            value={formatUsdCents(t.quick_pay_cents)}
            href="/driver-finance/company-settlements"
            testId="trip-profit-kpi-quick-pay"
          />
          <V3KpiTile
            label="Driver pay"
            value={formatUsdCents(t.driver_pay_cents + t.additional_driver_pay_cents)}
            href="/driver-finance/company-settlements"
            testId="trip-profit-kpi-driver-pay"
          />
          <V3KpiTile
            label="Net profit"
            value={formatUsdCents(t.net_profit_cents)}
            tone={t.net_profit_cents < 0 ? "red" : "green"}
            href="/driver-finance/company-settlements"
            testId="trip-profit-kpi-net-profit"
          />
        </div>
      )}

      <ParityTable<TripProfitabilityRow> appearance="board" title="Settlements — P&L by settlement"
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
