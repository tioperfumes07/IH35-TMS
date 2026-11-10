/**
 * Row 78 (11-03 register) — Dispatch › Load history, board docs/design/v3/V3-Dispatch-LoadHistory.dc.html.
 * Every load the company booked, from the load hub (mdata.loads), newest first. Every cell opens its record: the
 * load #, customer, driver, truck, invoice and settlement open their own pages; any other cell opens the load's
 * panel (timeline · money · linked records) on this page.
 *
 * Sources — no second engine:
 *   list + KPIs + status counts  GET /api/v1/reports/loads-history (loads-history.service.ts: loads-report rows +
 *                                the canonical load-cost rollup, DB-side totals)
 *   panel                        LoadHistoryDetailPanel (load history timeline, load-cost rollup, expenses, docs)
 * The single-load change timeline (/dispatch/loads/:id/history, LoadHistoryPage) stays as its own page.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLoadsHistory, type LoadsHistoryRow } from "../../api/reports";
import { EntityMultiSelect } from "../../components/EntityMultiSelect";
import { SelectCombobox } from "../../components/Combobox";
import { DispatchSubnav } from "../../components/dispatch/DispatchSubnav";
import { ImportLoadHistoryAction } from "../../components/imports/OwnerImportActions";
import { LoadDetailDrawer } from "../../components/dispatch/LoadDetailDrawer";
import { LoadHistoryDetailPanel } from "../../components/dispatch/LoadHistoryDetailPanel";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { computePresetRange, ReportFilterBar } from "../../components/reports/ReportFilterBar";
import { EntityLink } from "../../components/shared/EntityLink";
import { useStagedListFilters } from "../../components/table";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { companyToday } from "../../lib/businessDate";
import { entityLabel } from "../../lib/entity-label";
import { formatCompanyName } from "../../lib/formatCompanyName";
import { formatDateUS } from "../../lib/formatDate";
import { formatPersonName } from "../../lib/formatPersonName";
import { loadStatusLabel } from "../../lib/load-status";
import { formatNumber, formatUsdCents } from "../../lib/money";
import { statusOptions } from "../../lib/statusListParams";
import { formatQueryErrorDetail } from "../../lib/tableError";

/** "All" — every load ever booked. The loads hub has no load before this date. */
export const LOAD_HISTORY_ALL_FROM = "2000-01-01";
const PAGE = 200;

const STATUS_FILTER_OPTIONS = statusOptions(
  Object.fromEntries(
    [
      "booked",
      "assigned",
      "dispatched",
      "in_transit",
      "delivered",
      "delivered_pending_docs",
      "completed_docs_received",
      "invoiced",
      "closed",
      "paid",
      "cancelled",
    ].map((s) => [s, loadStatusLabel(s)])
  )
);
const TRIP_OPTIONS = statusOptions({ NB: "NB", TR: "TR", SB: "SB", LOCAL: "LOCAL" });

type Filters = {
  start: string;
  end: string;
  dateField: "pickup" | "delivery";
  customerId: string;
  driverId: string;
  unitId: string;
  status: string[];
  tripType: string[];
  includeCancelled: boolean;
};

function place(city: string | null, state: string | null) {
  const v = [city, state].filter(Boolean).join(", ");
  return v || "—";
}

/** Rate per loaded mile, in cents. */
export function ratePerMileCents(revenueCents: number, miles: number | null | undefined): number | null {
  if (!miles || miles <= 0) return null;
  return Math.round(revenueCents / miles);
}

/** Empty miles as a share of all miles (loaded + empty), 1 decimal. */
export function emptyMilesPct(loaded: number, empty: number): string {
  const all = loaded + empty;
  if (all <= 0) return "—";
  return `${((empty / all) * 100).toFixed(1)}%`;
}

/** Which rows the API is asked for: the cancelled exclusion lifts only when the viewer asks for it. */
export function loadHistoryApiParams(f: Filters) {
  const wantsCancelled = f.includeCancelled || f.status.includes("cancelled");
  return {
    from: f.start,
    to: f.end,
    date_field: f.dateField,
    customer_id: f.customerId || undefined,
    driver_id: f.driverId || undefined,
    unit_id: f.unitId || undefined,
    status: f.status.length === 1 ? f.status[0] : undefined,
    trip_type: f.tripType.length === 1 ? f.tripType[0] : undefined,
    include_cancelled: wantsCancelled,
  };
}

export default function LoadHistoryBoardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const emptyFilters: Filters = {
    start: LOAD_HISTORY_ALL_FROM,
    end: companyToday(),
    dateField: "pickup",
    customerId: "",
    driverId: "",
    unitId: "",
    status: [],
    tripType: [],
    includeCancelled: false,
  };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({ applied, empty: emptyFilters, onApply: setApplied });
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerLoadId, setDrawerLoadId] = useState<string | null>(null);

  const params = loadHistoryApiParams(applied);
  const query = useQuery({
    queryKey: ["dispatch", "load-history-board", companyId, params, offset],
    queryFn: () => getLoadsHistory({ operating_company_id: companyId, ...params, limit: PAGE, offset }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const rows = useMemo(() => {
    let list = query.data?.rows ?? [];
    if (applied.status.length > 1) list = list.filter((r) => applied.status.includes(String(r.status ?? "")));
    if (applied.tripType.length > 1) list = list.filter((r) => applied.tripType.includes(String(r.trip_type ?? "")));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.load_number, r.customer_name, r.driver_name, r.unit_number, r.origin_city, r.destination_city, r.invoice_number, r.settlement_number].some((v) =>
          String(v ?? "").toLowerCase().includes(q)
        )
      );
    }
    return list;
  }, [query.data?.rows, applied.status, applied.tripType, search]);

  const selected = useMemo(() => rows.find((r) => r.load_id === selectedId) ?? null, [rows, selectedId]);
  const totals = query.data?.totals;
  const statusCounts = query.data?.status_counts ?? [];
  const allBooked = statusCounts.reduce((s, c) => s + c.count, 0);
  const cancelled = statusCounts.find((c) => c.status === "cancelled")?.count ?? 0;
  const total = query.data?.pagination.total ?? 0;

  const openPanel = (r: LoadsHistoryRow) => setSelectedId(r.load_id);
  const cellButton = (r: LoadsHistoryRow, content: React.ReactNode, testId?: string) => (
    <button
      type="button"
      className="text-left text-[#1F2A44] hover:text-[#1F2A44] hover:underline"
      onClick={() => openPanel(r)}
      data-testid={testId}
      title="Open this load's timeline, money and linked records"
    >
      {content}
    </button>
  );

  const columns = useMemo<ParityColumn<LoadsHistoryRow>[]>(
    () => [
      {
        key: "load_number",
        label: "Load #",
        sortable: true,
        render: (r) => <EntityLink kind="load" id={r.load_id} label={entityLabel(r.load_number, r.load_id, "Load")} data-testid={`load-history-load-${r.load_id}`} />,
      },
      { key: "status", label: "Status", sortable: true, sortValue: (r) => r.status ?? "", render: (r) => cellButton(r, loadStatusLabel(r.status), `load-history-status-${r.load_id}`) },
      { key: "trip_type", label: "Trip", sortable: true, render: (r) => cellButton(r, r.trip_type ?? "—") },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (r) =>
          r.customer_id ? (
            <EntityLink kind="customer" id={r.customer_id} label={r.customer_name ? formatCompanyName(r.customer_name) : entityLabel(null, r.customer_id, "Customer")} />
          ) : (
            cellButton(r, "—")
          ),
      },
      { key: "origin", label: "Origin", sortable: true, sortValue: (r) => place(r.origin_city, r.origin_state), render: (r) => cellButton(r, place(r.origin_city, r.origin_state)) },
      { key: "pickup_date", label: "PU", sortable: true, render: (r) => cellButton(r, formatDateUS(r.pickup_date) || "—") },
      {
        key: "destination",
        label: "Destination",
        sortable: true,
        sortValue: (r) => place(r.destination_city, r.destination_state),
        render: (r) => cellButton(r, place(r.destination_city, r.destination_state)),
      },
      { key: "delivery_date", label: "DEL", sortable: true, render: (r) => cellButton(r, formatDateUS(r.delivery_date) || "—") },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (r) =>
          r.driver_id ? (
            <EntityLink kind="driver" id={r.driver_id} label={r.driver_name ? formatPersonName(r.driver_name) : entityLabel(null, r.driver_id, "Driver")} />
          ) : (
            cellButton(r, "—")
          ),
      },
      {
        key: "unit_number",
        label: "Truck",
        sortable: true,
        render: (r) => (r.unit_id ? <EntityLink kind="unit" id={r.unit_id} label={entityLabel(r.unit_number, r.unit_id, "Unit")} /> : cellButton(r, "—")),
      },
      {
        key: "miles_practical",
        label: "Loaded mi",
        sortable: true,
        cellClass: "text-right",
        className: "text-right",
        render: (r) => cellButton(r, r.miles_practical == null ? "—" : formatNumber(r.miles_practical)),
      },
      {
        key: "miles_deadhead",
        label: "Empty mi",
        sortable: true,
        cellClass: "text-right",
        className: "text-right",
        render: (r) => cellButton(r, r.miles_deadhead == null ? "—" : formatNumber(r.miles_deadhead)),
      },
      { key: "revenue_cents", label: "Rate", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => cellButton(r, formatUsdCents(r.revenue_cents)) },
      {
        key: "rpm",
        label: "$/mi",
        sortable: true,
        sortValue: (r) => ratePerMileCents(r.revenue_cents, r.miles_practical) ?? 0,
        cellClass: "text-right",
        className: "text-right",
        render: (r) => {
          const c = ratePerMileCents(r.revenue_cents, r.miles_practical);
          return cellButton(r, c == null ? "—" : formatUsdCents(c));
        },
      },
      {
        key: "invoice_number",
        label: "Invoice",
        sortable: true,
        render: (r) =>
          r.invoice_id ? (
            <EntityLink kind="invoice" id={r.invoice_id} label={entityLabel(r.invoice_number, r.invoice_id, "Invoice")} />
          ) : (
            cellButton(r, <span className="text-[#6B7280]">not invoiced</span>)
          ),
      },
      { key: "driver_pay_cents", label: "Driver pay", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => cellButton(r, formatUsdCents(r.driver_pay_cents)) },
      {
        key: "settlement_number",
        label: "Settlement",
        sortable: true,
        render: (r) =>
          r.settlement_id ? (
            <EntityLink kind="settlement" id={r.settlement_id} label={entityLabel(r.settlement_number, r.settlement_id, "Settlement")} />
          ) : (
            cellButton(r, r.settlement_number ?? "—")
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const kpiValue = (v: string) => (query.data ? v : "…");

  return (
    <div className="space-y-3 p-4" data-testid="load-history-board">
      <DispatchSubnav operatingCompanyId={companyId} />
      <PageHeader
        backHref="/dispatch"
        title="Load history"
        subtitle="every load ever booked · from the load hub (mdata.loads) · money from the load-cost rollup"
        breadcrumb={["Dispatch", "Load history"]}
        actions={<ImportLoadHistoryAction />}
      />

      <ReportFilterBar
        testIdPrefix="load-history"
        fromDate={staged.draft.start}
        toDate={staged.draft.end}
        onFromDateChange={(d) => staged.setDraft((p) => ({ ...p, start: d ?? "" }))}
        onToDateChange={(d) => staged.setDraft((p) => ({ ...p, end: d ?? "" }))}
        onPresetSelect={(preset) => {
          const r = computePresetRange(preset);
          staged.setDraft((p) => ({ ...p, start: r.from, end: r.to }));
        }}
        search={search}
        onSearchChange={setSearch}
        onApply={() => {
          setOffset(0);
          setSelectedId(null);
          staged.apply();
        }}
        onCancel={staged.cancel}
        onReset={staged.reset}
        applyDisabled={!staged.dirty}
      >
        <button
          type="button"
          className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#1F2A44]"
          onClick={() => staged.setDraft((p) => ({ ...p, start: LOAD_HISTORY_ALL_FROM, end: companyToday() }))}
          data-testid="load-history-preset-all"
        >
          All
        </button>
        <label className="flex items-center gap-1 text-xs text-[#4B5563]">
          <span className="font-semibold">Date on</span>
          <SelectCombobox
            className="h-7 rounded-sm border border-[#E5E7EB] px-2 text-xs"
            value={staged.draft.dateField}
            onChange={(e) => staged.setDraft((p) => ({ ...p, dateField: e.target.value as "pickup" | "delivery" }))}
          >
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </SelectCombobox>
        </label>
        <MultiSelectDropdown
          label="Status"
          options={STATUS_FILTER_OPTIONS}
          selected={staged.draft.status}
          onChange={(next) => staged.setDraft((p) => ({ ...p, status: next }))}
          allLabel="All except cancelled"
          data-testid="load-history-status-filter"
        />
        <MultiSelectDropdown
          label="Trip"
          options={TRIP_OPTIONS}
          selected={staged.draft.tripType}
          onChange={(next) => staged.setDraft((p) => ({ ...p, tripType: next }))}
          allLabel="NB · TR · SB · Local"
          data-testid="load-history-trip-filter"
        />
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-[#4B5563]">
          <span className="font-semibold">Customer</span>
          <EntityMultiSelect
            kind="customer"
            operatingCompanyId={companyId}
            value={staged.draft.customerId || null}
            onChange={(next) => staged.setDraft((p) => ({ ...p, customerId: next ?? "" }))}
            placeholder="All customers"
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-[#4B5563]">
          <span className="font-semibold">Driver</span>
          <EntityMultiSelect
            kind="driver"
            operatingCompanyId={companyId}
            value={staged.draft.driverId || null}
            onChange={(next) => staged.setDraft((p) => ({ ...p, driverId: next ?? "" }))}
            placeholder="All drivers"
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-[#4B5563]">
          <span className="font-semibold">Truck</span>
          <EntityMultiSelect
            kind="unit"
            operatingCompanyId={companyId}
            value={staged.draft.unitId || null}
            onChange={(next) => staged.setDraft((p) => ({ ...p, unitId: next ?? "" }))}
            placeholder="All trucks"
          />
        </label>
      </ReportFilterBar>

      {query.isError ? (
        <ListErrorState title="Couldn't load the load history" {...formatQueryErrorDetail(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <V3KpiTile
          testId="load-history-kpi-loads"
          label="Loads"
          value={kpiValue(String(totals?.load_count ?? 0))}
          sub={`${allBooked} booked · ${cancelled} cancelled`}
          onClick={() => {
            const next = { ...applied, includeCancelled: true, status: [] };
            setOffset(0);
            setApplied(next);
          }}
          title="View all — include cancelled loads"
        />
        <V3KpiTile
          testId="load-history-kpi-revenue"
          label="Revenue (rate)"
          value={kpiValue(formatUsdCents(totals?.revenue_cents ?? 0))}
          sub={`${totals?.customer_count ?? 0} customers`}
          noDrill="the sum of the Rate column of the loads listed below"
        />
        <V3KpiTile
          testId="load-history-kpi-loaded-miles"
          label="Loaded miles"
          value={kpiValue(formatNumber(totals?.loaded_miles ?? 0))}
          sub="practical miles on the load"
          noDrill="the sum of the Loaded mi column below"
        />
        <V3KpiTile
          testId="load-history-kpi-empty-miles"
          label="Empty miles"
          value={kpiValue(formatNumber(totals?.empty_miles ?? 0))}
          sub={`${emptyMilesPct(totals?.loaded_miles ?? 0, totals?.empty_miles ?? 0)} of all miles`}
          noDrill="the sum of the Empty mi column below"
        />
        <V3KpiTile
          testId="load-history-kpi-rpm"
          label="Rate per loaded mile"
          value={kpiValue(
            (() => {
              const c = ratePerMileCents(totals?.revenue_cents ?? 0, totals?.loaded_miles ?? 0);
              return c == null ? "—" : formatUsdCents(c);
            })()
          )}
          sub="revenue ÷ loaded mi"
          noDrill="revenue ÷ loaded miles of the loads below"
        />
        <V3KpiTile
          testId="load-history-kpi-not-invoiced"
          label="Delivered, not invoiced"
          value={kpiValue(String(totals?.delivered_not_invoiced ?? 0))}
          sub="open list"
          href="/dispatch/awaiting-bol-invoice"
        />
      </div>

      <div className={selected ? "grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]" : ""}>
        <ParityTable
          appearance="board"
          rows={rows}
          title={`${total} loads · newest first · every cell opens its record`}
          columns={columns}
          rowKey={(r) => r.load_id}
          loading={query.isPending}
          storageKey="dispatch-load-history-board"
          emptyText="No loads match these filters."
          exportFilename="load-history"
          exportExcel
          minWidthPx={1800}
          tableTestId="load-history-table"
          footerCells={{
            load_number: <span className="font-semibold text-[#111827]">Totals ({rows.length})</span>,
            revenue_cents: formatUsdCents(rows.reduce((s, r) => s + r.revenue_cents, 0)),
            driver_pay_cents: formatUsdCents(rows.reduce((s, r) => s + r.driver_pay_cents, 0)),
          }}
        />
        {selected ? (
          <LoadHistoryDetailPanel
            row={selected}
            operatingCompanyId={companyId}
            onClose={() => setSelectedId(null)}
            onOpenLoad={(id) => setDrawerLoadId(id)}
          />
        ) : null}
      </div>

      {total > PAGE ? (
        <div className="flex items-center gap-2 text-xs text-[#4B5563]" data-testid="load-history-pager">
          <button type="button" disabled={offset === 0} className="rounded-sm border px-2 py-1 disabled:opacity-40" onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            ← Newer
          </button>
          <span>
            {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
          </span>
          <button type="button" disabled={offset + PAGE >= total} className="rounded-sm border px-2 py-1 disabled:opacity-40" onClick={() => setOffset(offset + PAGE)}>
            Older →
          </button>
        </div>
      ) : null}

      <p className="text-xs text-[#4B5563]" data-testid="load-history-status-counts">
        Status counts:{" "}
        {statusCounts.length === 0
          ? "—"
          : statusCounts.map((c, i) => (
              <span key={c.status}>
                {i > 0 ? " · " : ""}
                <button
                  type="button"
                  className="hover:text-[#1F2A44] hover:underline"
                  onClick={() => {
                    setOffset(0);
                    setApplied({ ...applied, status: [c.status], includeCancelled: c.status === "cancelled" });
                  }}
                >
                  {loadStatusLabel(c.status).toLowerCase()} {c.count}
                </button>
              </span>
            ))}
        . Click the load # to open the load; customer, driver, truck, invoice and settlement open their own pages. Any
        other cell opens the load's timeline, money and linked records here.
      </p>

      {drawerLoadId ? (
        <LoadDetailDrawer
          loadId={drawerLoadId}
          isOpen
          canEdit={false}
          canEditReason="Opened from Load history (read-only)"
          operatingCompanyId={companyId}
          openedFrom="dispatch"
          onClose={() => setDrawerLoadId(null)}
        />
      ) : null}
    </div>
  );
}
