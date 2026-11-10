/**
 * Row 79 (11-03 register) — Reports › Loads report, board docs/design/v3/V3-Reports-Loads.dc.html.
 * Replaces the old LoadsReportPage (row 84). Data: GET /api/v1/reports/loads (loads-report.service.ts — mdata.loads +
 * the canonical load-cost rollup). Group-by (week / month / customer / driver / truck / lane / trip type) is a pure
 * client-side grouping of those rows; every total is a sum of the same rows, so the groups always tie to the KPIs.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLoadsReport, type LoadsReportRow } from "../../../api/reports";
import { EntityMultiSelect, entityFilterIds } from "../../../components/EntityMultiSelect";
import { SelectCombobox } from "../../../components/Combobox";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ReportFilterBar } from "../../../components/reports/ReportFilterBar";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useStagedListFilters } from "../../../components/table";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { companyToday } from "../../../lib/businessDate";
import { entityLabel } from "../../../lib/entity-label";
import { formatCompanyName } from "../../../lib/formatCompanyName";
import { mmmDd } from "../../../lib/formatDate";
import { formatPersonName } from "../../../lib/formatPersonName";
import { formatNumber, formatUsdCents } from "../../../lib/money";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { statusOptions } from "../../../lib/statusListParams";
import { ReportBoardShell, ReportKpiGrid, ReportMeasuredNote } from "./ReportBoardShell";
import { groupBy, monthKey, pct, pctLabel, sumBy, weekStartIso } from "./reportBoardGroup";

type GroupBy = "load" | "week" | "month" | "customer" | "driver" | "truck" | "lane" | "trip";

const GROUP_OPTIONS: Array<{ id: GroupBy; label: string }> = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "customer", label: "Customer" },
  { id: "driver", label: "Driver" },
  { id: "truck", label: "Truck" },
  { id: "lane", label: "Lane" },
  { id: "trip", label: "Trip type" },
  { id: "load", label: "Load" },
];

const STATUS_FILTER_OPTIONS = statusOptions({
  booked: "Booked",
  dispatched: "Dispatched",
  in_transit: "In transit",
  delivered: "Delivered",
  delivered_pending_docs: "Delivered pending docs",
  completed_docs_received: "Completed docs received",
  closed: "Closed",
  invoiced: "Invoiced",
  paid: "Paid",
});

const TRIP_OPTIONS = statusOptions({ NB: "NB", TR: "TR", SB: "SB", LOCAL: "LOCAL" });

type Filters = {
  start: string;
  end: string;
  dateField: "pickup" | "delivery";
  customerId: string;
  driverId: string;
  unitId: string;
  trailerId: string;
  status: string[];
  tripType: string[];
};

type GroupRow = {
  key: string;
  label: string;
  link: { kind: "customer" | "driver" | "unit"; id: string } | null;
  rows: LoadsReportRow[];
  loads: number;
  revenue: number;
  miles: number;
  emptyMiles: number;
  driverPay: number;
  fuel: number;
  margin: number;
  customers: number;
  trucks: number;
};

function laneLabel(row: LoadsReportRow) {
  const from = [row.origin_city, row.origin_state].filter(Boolean).join(", ");
  const to = [row.destination_city, row.destination_state].filter(Boolean).join(", ");
  if (!from && !to) return "No stops";
  return `${from || "—"} → ${to || "—"}`;
}

function money(cents: number) {
  return formatUsdCents(cents);
}

function perMile(cents: number, miles: number) {
  return miles ? formatUsdCents(Math.round(cents / miles)) : "—";
}

function rowDate(row: LoadsReportRow, field: "pickup" | "delivery") {
  return (field === "delivery" ? row.delivery_date : row.pickup_date) ?? "";
}

function keyOf(row: LoadsReportRow, by: GroupBy, field: "pickup" | "delivery"): { key: string; label: string; link: GroupRow["link"] } {
  const d = rowDate(row, field);
  switch (by) {
    case "week": {
      const w = d ? weekStartIso(d) : "";
      return { key: w || "none", label: w ? `Week of ${mmmDd(w)}` : "No stop date", link: null };
    }
    case "month": {
      const m = d ? monthKey(d) : "";
      return { key: m || "none", label: m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : "No stop date", link: null };
    }
    case "customer":
      return {
        key: row.customer_id ?? "none",
        label: row.customer_name ? formatCompanyName(row.customer_name) : "No customer",
        link: row.customer_id ? { kind: "customer", id: row.customer_id } : null,
      };
    case "driver":
      return {
        key: row.driver_id ?? "none",
        label: row.driver_name ? formatPersonName(row.driver_name) : "No driver",
        link: row.driver_id ? { kind: "driver", id: row.driver_id } : null,
      };
    case "truck":
      return { key: row.unit_id ?? "none", label: row.unit_number ?? "No truck", link: row.unit_id ? { kind: "unit", id: row.unit_id } : null };
    case "lane": {
      const l = laneLabel(row);
      return { key: l, label: l, link: null };
    }
    case "trip":
      return { key: row.trip_type ?? "none", label: row.trip_type ?? "No trip type", link: null };
    default:
      return { key: row.load_id, label: row.load_number ?? row.load_id, link: null };
  }
}

function buildGroups(rows: LoadsReportRow[], by: GroupBy, field: "pickup" | "delivery"): GroupRow[] {
  const labels = new Map<string, { label: string; link: GroupRow["link"] }>();
  const grouped = groupBy(rows, (r) => {
    const k = keyOf(r, by, field);
    labels.set(k.key, { label: k.label, link: k.link });
    return k.key;
  });
  const out: GroupRow[] = [];
  for (const [key, list] of grouped) {
    out.push({
      key,
      label: labels.get(key)?.label ?? key,
      link: labels.get(key)?.link ?? null,
      rows: list,
      loads: list.length,
      revenue: sumBy(list, (r) => r.revenue_cents),
      miles: sumBy(list, (r) => r.miles_practical),
      emptyMiles: sumBy(list, (r) => r.miles_deadhead),
      driverPay: sumBy(list, (r) => r.driver_pay_cents),
      fuel: sumBy(list, (r) => r.fuel_cents),
      margin: sumBy(list, (r) => r.margin_cents),
      customers: new Set(list.map((r) => r.customer_id).filter(Boolean)).size,
      trucks: new Set(list.map((r) => r.unit_id).filter(Boolean)).size,
    });
  }
  if (by === "week" || by === "month") return out.sort((a, b) => b.key.localeCompare(a.key));
  return out.sort((a, b) => b.revenue - a.revenue);
}

function ytdStart() {
  return `${companyToday().slice(0, 4)}-01-01`;
}

export function LoadsReportBoard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const emptyFilters: Filters = {
    start: ytdStart(),
    end: companyToday(),
    dateField: "pickup",
    customerId: "",
    driverId: "",
    unitId: "",
    trailerId: "",
    status: [],
    tripType: [],
  };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({ applied, empty: emptyFilters, onApply: setApplied });
  const [search, setSearch] = useState("");
  const [by, setBy] = useState<GroupBy>("week");
  const [drill, setDrill] = useState<{ by: GroupBy; key: string; label: string } | null>(null);

  const query = useQuery({
    queryKey: ["reports", "loads-board", companyId, { ...applied, status: applied.status.join(","), tripType: applied.tripType.join(",") }],
    queryFn: () =>
      getLoadsReport({
        operating_company_id: companyId,
        from: applied.start,
        to: applied.end,
        date_field: applied.dateField,
        customer_id: applied.customerId || undefined,
        driver_id: applied.driverId || undefined,
        unit_id: applied.unitId || undefined,
        trailer_id: applied.trailerId || undefined,
        status: applied.status.length === 1 ? applied.status[0] : undefined,
        trip_type: applied.tripType.length === 1 ? applied.tripType[0] : undefined,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  // Multi-select status / trip type: the API takes one value; 2+ are applied to the same rows here.
  const rows = useMemo(() => {
    let list = query.data?.rows ?? [];
    if (applied.status.length > 1) list = list.filter((r) => applied.status.includes(String(r.status ?? "")));
    if (applied.tripType.length > 1) list = list.filter((r) => applied.tripType.includes(String(r.trip_type ?? "")));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.load_number, r.customer_name, r.driver_name, r.unit_number, laneLabel(r)].some((v) => String(v ?? "").toLowerCase().includes(q))
      );
    }
    return list;
  }, [query.data?.rows, applied.status, applied.tripType, search]);

  const totals = useMemo(() => {
    const revenue = sumBy(rows, (r) => r.revenue_cents);
    const driverPay = sumBy(rows, (r) => r.driver_pay_cents);
    const miles = sumBy(rows, (r) => r.miles_practical);
    const emptyMiles = sumBy(rows, (r) => r.miles_deadhead);
    return {
      loads: rows.length,
      revenue,
      miles,
      emptyMiles,
      driverPay,
      fuel: sumBy(rows, (r) => r.fuel_cents),
      margin: sumBy(rows, (r) => r.margin_cents),
      customers: new Set(rows.map((r) => r.customer_id).filter(Boolean)).size,
      trucks: new Set(rows.map((r) => r.unit_id).filter(Boolean)).size,
    };
  }, [rows]);

  /** R3 — revenue-by-week chart from the same filtered rows (engine data, not mock). */
  const revenueByWeek = useMemo(() => {
    const byWeek = buildGroups(rows, "week", applied.dateField).slice().reverse();
    const max = Math.max(1, ...byWeek.map((g) => g.revenue));
    return { weeks: byWeek, max };
  }, [rows, applied.dateField]);

  const groups = useMemo(() => buildGroups(rows, by === "load" ? "week" : by, applied.dateField), [rows, by, applied.dateField]);
  const detailRows = useMemo(() => {
    if (!drill) return rows;
    return rows.filter((r) => keyOf(r, drill.by, applied.dateField).key === drill.key);
  }, [rows, drill, applied.dateField]);
  const showDetail = by === "load" || drill != null;

  const groupColumns = useMemo<ParityColumn<GroupRow>[]>(
    () => [
      {
        key: "label",
        label: GROUP_OPTIONS.find((g) => g.id === by)?.label ?? "Group",
        sortable: true,
        sortValue: (g) => g.key,
        render: (g) =>
          g.link ? (
            <EntityLink kind={g.link.kind} id={g.link.id} label={g.label} />
          ) : (
            <button
              type="button"
              className="font-semibold text-[#1D4ED8] hover:underline"
              onClick={() => setDrill({ by, key: g.key, label: g.label })}
              data-testid={`loads-report-group-${g.key}`}
            >
              {g.label}
            </button>
          ),
      },
      {
        key: "loads",
        label: "Loads",
        sortable: true,
        sortValue: (g) => g.loads,
        cellClass: "text-right",
        className: "text-right",
        render: (g) => (
          <button type="button" className="text-[#1D4ED8] hover:underline" onClick={() => setDrill({ by, key: g.key, label: g.label })}>
            {g.loads}
          </button>
        ),
      },
      { key: "revenue", label: "Revenue", sortable: true, sortValue: (g) => g.revenue, cellClass: "text-right", className: "text-right", render: (g) => money(g.revenue) },
      { key: "miles", label: "Loaded mi", sortable: true, sortValue: (g) => g.miles, cellClass: "text-right", className: "text-right", render: (g) => formatNumber(g.miles) },
      { key: "emptyMiles", label: "Empty mi", sortable: true, sortValue: (g) => g.emptyMiles, cellClass: "text-right", className: "text-right", render: (g) => formatNumber(g.emptyMiles) },
      {
        key: "emptyPct",
        label: "Empty %",
        sortable: true,
        sortValue: (g) => pct(g.emptyMiles, g.miles + g.emptyMiles) ?? 0,
        cellClass: "text-right",
        className: "text-right",
        render: (g) => pctLabel(pct(g.emptyMiles, g.miles + g.emptyMiles)),
      },
      { key: "rpm", label: "$/loaded mi", sortable: true, sortValue: (g) => (g.miles ? g.revenue / g.miles : 0), cellClass: "text-right", className: "text-right", render: (g) => perMile(g.revenue, g.miles) },
      { key: "driverPay", label: "Driver pay", sortable: true, sortValue: (g) => g.driverPay, cellClass: "text-right", className: "text-right", render: (g) => money(g.driverPay) },
      { key: "payPct", label: "Pay % rev", sortable: true, sortValue: (g) => pct(g.driverPay, g.revenue) ?? 0, cellClass: "text-right", className: "text-right", render: (g) => pctLabel(pct(g.driverPay, g.revenue)) },
      { key: "fuel", label: "Fuel", sortable: true, sortValue: (g) => g.fuel, cellClass: "text-right", className: "text-right", render: (g) => money(g.fuel) },
      { key: "margin", label: "Margin", sortable: true, sortValue: (g) => g.margin, cellClass: "text-right", className: "text-right", render: (g) => money(g.margin) },
      { key: "customers", label: "Customers", sortable: true, sortValue: (g) => g.customers, cellClass: "text-right", className: "text-right", render: (g) => String(g.customers) },
      { key: "trucks", label: "Trucks", sortable: true, sortValue: (g) => g.trucks, cellClass: "text-right", className: "text-right", render: (g) => String(g.trucks) },
      {
        key: "revPerTruck",
        label: "Rev / truck",
        sortable: true,
        sortValue: (g) => (g.trucks ? g.revenue / g.trucks : 0),
        cellClass: "text-right",
        className: "text-right",
        render: (g) => (g.trucks ? money(Math.round(g.revenue / g.trucks)) : "—"),
      },
    ],
    [by]
  );

  const loadColumns = useMemo<ParityColumn<LoadsReportRow>[]>(
    () => [
      { key: "load_number", label: "Load", sortable: true, render: (r) => <EntityLink kind="load" id={r.load_id} label={entityLabel(r.load_number, r.load_id, "Load")} /> },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (r) => <EntityLink kind="customer" id={r.customer_id} label={r.customer_name ? formatCompanyName(r.customer_name) : entityLabel(null, r.customer_id, "Customer")} />,
      },
      { key: "trip_type", label: "Trip", sortable: true, render: (r) => r.trip_type ?? "—" },
      { key: "status", label: "Status", sortable: true, render: (r) => r.status ?? "—" },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (r) => <EntityLink kind="driver" id={r.driver_id} label={r.driver_name ? formatPersonName(r.driver_name) : entityLabel(null, r.driver_id, "Driver")} />,
      },
      { key: "unit_number", label: "Truck", sortable: true, render: (r) => <EntityLink kind="unit" id={r.unit_id} label={entityLabel(r.unit_number, r.unit_id, "Unit")} /> },
      { key: "trailer_number", label: "Trailer", sortable: true, render: (r) => <EntityLink kind="trailer" id={r.trailer_id} label={entityLabel(r.trailer_number, r.trailer_id, "Trailer")} /> },
      { key: "lane", label: "Lane", sortable: true, sortValue: (r) => laneLabel(r), render: (r) => laneLabel(r) },
      { key: "pickup_date", label: "Pickup", sortable: true, render: (r) => mmmDd(r.pickup_date) || "—" },
      { key: "delivery_date", label: "Delivery", sortable: true, render: (r) => mmmDd(r.delivery_date) || "—" },
      { key: "miles_practical", label: "Loaded mi", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => (r.miles_practical == null ? "—" : formatNumber(r.miles_practical)) },
      { key: "miles_deadhead", label: "Empty mi", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => (r.miles_deadhead == null ? "—" : formatNumber(r.miles_deadhead)) },
      {
        key: "empty_pct",
        label: "Empty %",
        sortable: true,
        sortValue: (r) => pct(r.miles_deadhead ?? 0, (r.miles_practical ?? 0) + (r.miles_deadhead ?? 0)) ?? 0,
        cellClass: "text-right",
        className: "text-right",
        render: (r) => pctLabel(pct(r.miles_deadhead ?? 0, (r.miles_practical ?? 0) + (r.miles_deadhead ?? 0))),
      },
      { key: "revenue_cents", label: "Revenue", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.revenue_cents) },
      { key: "driver_pay_cents", label: "Driver pay", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.driver_pay_cents) },
      { key: "fuel_cents", label: "Fuel", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.fuel_cents) },
      { key: "margin_cents", label: "Margin", sortable: true, cellClass: "text-right", className: "text-right", render: (r) => money(r.margin_cents) },
      {
        key: "invoice_number",
        label: "Invoice",
        sortable: true,
        render: (r) => (r.invoice_id ? <EntityLink kind="invoice" id={r.invoice_id} label={entityLabel(r.invoice_number, r.invoice_id, "Invoice")} /> : "—"),
      },
      {
        key: "factoring_display",
        label: "Factored",
        sortable: true,
        render: (r) =>
          r.factoring_advance_id ? (
            <EntityLink kind="factoring_advance" id={r.factoring_advance_id} label={entityLabel(r.factoring_display, r.factoring_advance_id, "Advance")} />
          ) : (
            "—"
          ),
      },
      {
        key: "settlement_number",
        label: "Settlement",
        sortable: true,
        render: (r) =>
          r.settlement_id ? (
            <EntityLink kind="settlement" id={r.settlement_id} label={entityLabel(r.settlement_number, r.settlement_id, "Settlement")} />
          ) : (
            r.settlement_number ?? "—"
          ),
      },
    ],
    []
  );

  const xlsx = () => {
    if (showDetail) {
      return {
        filename: "loads-report-loads",
        header: ["Load", "Customer", "Trip", "Status", "Driver", "Truck", "Lane", "Pickup", "Delivery", "Loaded mi", "Revenue", "Driver pay", "Fuel", "Margin", "Invoice", "Settlement"],
        body: detailRows.map((r) => [
          r.load_number ?? "",
          formatCompanyName(r.customer_name ?? ""),
          r.trip_type ?? "",
          r.status ?? "",
          formatPersonName(r.driver_name ?? ""),
          r.unit_number ?? "",
          laneLabel(r),
          mmmDd(r.pickup_date),
          mmmDd(r.delivery_date),
          r.miles_practical ?? 0,
          r.revenue_cents / 100,
          r.driver_pay_cents / 100,
          r.fuel_cents / 100,
          r.margin_cents / 100,
          r.invoice_number ?? "",
          r.settlement_number ?? "",
        ]),
      };
    }
    return {
      filename: `loads-report-by-${by}`,
      header: [GROUP_OPTIONS.find((g) => g.id === by)?.label ?? "Group", "Loads", "Revenue", "Loaded mi", "Driver pay", "Fuel", "Margin", "Customers", "Trucks"],
      body: groups.map((g) => [g.label, g.loads, g.revenue / 100, g.miles, g.driverPay / 100, g.fuel / 100, g.margin / 100, g.customers, g.trucks]),
    };
  };

  return (
    <ReportBoardShell
      id="loads-report"
      subtitle="revenue, miles and driver pay by period · accrual · source: load hub + load-cost rollup"
      xlsx={xlsx}
    >
      <div data-testid="loads-report-page" className="space-y-3">
        <ReportFilterBar
          testIdPrefix="reports-loads"
          fromDate={staged.draft.start}
          toDate={staged.draft.end}
          onFromDateChange={(d) => staged.setDraft((p) => ({ ...p, start: d ?? "" }))}
          onToDateChange={(d) => staged.setDraft((p) => ({ ...p, end: d ?? "" }))}
          onPresetSelect={() => undefined}
          search={search}
          onSearchChange={setSearch}
          onApply={() => {
            setDrill(null);
            staged.apply();
          }}
          onCancel={staged.cancel}
          onReset={staged.reset}
          applyDisabled={!staged.dirty}
        >
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
            allLabel="All statuses"
            data-testid="loads-report-status-filter"
          />
          <MultiSelectDropdown
            label="Trip type"
            options={TRIP_OPTIONS}
            selected={staged.draft.tripType}
            onChange={(next) => staged.setDraft((p) => ({ ...p, tripType: next }))}
            allLabel="All trip types"
            data-testid="loads-report-trip-filter"
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
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-[#4B5563]">
            <span className="font-semibold">Trailer</span>
            <EntityMultiSelect
              kind="trailer"
              operatingCompanyId={companyId}
              value={staged.draft.trailerId || null}
              onChange={(next) => staged.setDraft((p) => ({ ...p, trailerId: next ?? "" }))}
              placeholder="All trailers"
            />
          </label>
        </ReportFilterBar>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[#5B6576]">
          <span className="font-semibold text-[#111827]">Group by</span>
          <V3Segmented
            value={by}
            options={GROUP_OPTIONS}
            onChange={(next) => {
              setDrill(null);
              setBy(next);
            }}
            testId="loads-report-group-by"
          />
          {entityFilterIds(applied.customerId).length + entityFilterIds(applied.driverId).length + entityFilterIds(applied.unitId).length > 0 ? (
            <span>filtered by the selected records</span>
          ) : null}
        </div>

        {query.isError ? (
          <ListErrorState title="Couldn't load the loads report" {...formatQueryErrorDetail(query.error)} onRetry={() => void query.refetch()} />
        ) : null}

        <ReportKpiGrid>
          <V3KpiTile testId="loads-report-kpi-loads" label="Loads" value={query.data ? String(totals.loads) : "…"} sub="draft · cancelled · voided excluded" />
          <V3KpiTile testId="loads-report-kpi-revenue" label="Revenue" value={query.data ? money(totals.revenue) : "…"} sub={`by ${applied.dateField} date`} />
          <V3KpiTile testId="loads-report-kpi-miles" label="Loaded miles" value={query.data ? formatNumber(totals.miles) : "…"} sub="practical miles on the load" />
          <V3KpiTile testId="loads-report-kpi-rpm" label="Rate per loaded mile" value={query.data ? perMile(totals.revenue, totals.miles) : "…"} />
          <V3KpiTile
            testId="loads-report-kpi-driver-pay"
            label="Driver pay"
            value={query.data ? money(totals.driverPay) : "…"}
            sub={`${pctLabel(pct(totals.driverPay, totals.revenue))} of revenue`}
          />
          <V3KpiTile
            testId="loads-report-kpi-empty-miles"
            label="Empty miles"
            value={query.data ? formatNumber(totals.emptyMiles) : "…"}
            sub={
              query.data
                ? `${pctLabel(pct(totals.emptyMiles, totals.miles + totals.emptyMiles))} of all miles`
                : undefined
            }
          />
          {/* Additive vs board: Fuel/Margin stay; Empty miles is the board sixth KPI. */}
          <V3KpiTile testId="loads-report-kpi-margin" label="Margin" value={query.data ? money(totals.margin) : "…"} sub={`fuel ${money(totals.fuel)}`} />
        </ReportKpiGrid>

        <section className="rounded-sm border border-[#DDE1E7] bg-white p-3" data-testid="loads-report-revenue-by-week">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-bold text-[#111827]">Revenue by week</h3>
            <span className="text-section-header text-[#5B6576]">same filtered loads · {applied.dateField} date</span>
          </div>
          {revenueByWeek.weeks.length === 0 ? (
            <p className="text-xs text-[#5B6576]">No weekly revenue in range.</p>
          ) : (
            <div className="flex h-28 items-end gap-1" role="img" aria-label="Revenue by week chart">
              {revenueByWeek.weeks.map((g) => (
                <div key={g.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${g.label}: ${money(g.revenue)}`}>
                  <div
                    className="w-full rounded-sm bg-[#13233F]"
                    style={{ height: `${Math.max(4, Math.round((g.revenue / revenueByWeek.max) * 100))}%` }}
                    data-testid={`loads-report-week-bar-${g.key}`}
                  />
                  <span className="truncate text-section-header text-[#5B6576]">{g.label.replace("Week of ", "")}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {drill ? (
          <div className="flex items-center gap-2 text-xs text-[#5B6576]">
            <span>
              Loads in <strong className="text-[#111827]">{drill.label}</strong>
            </span>
            <button type="button" className="font-semibold text-[#1D4ED8] hover:underline" onClick={() => setDrill(null)}>
              ← back to {GROUP_OPTIONS.find((g) => g.id === by)?.label.toLowerCase()} groups
            </button>
          </div>
        ) : null}

        {showDetail ? (
          <ParityTable
            rows={detailRows}
            title="Loads"
            columns={loadColumns}
            rowKey={(r) => r.load_id}
            loading={query.isPending}
            storageKey="loads-report-board-loads"
            emptyText="No loads match these filters."
            exportFilename="loads-report.csv"
            exportExcel
            minWidthPx={1800}
            footerCells={{
              load_number: <span className="font-semibold text-[#111827]">Totals ({detailRows.length})</span>,
              revenue_cents: money(sumBy(detailRows, (r) => r.revenue_cents)),
              driver_pay_cents: money(sumBy(detailRows, (r) => r.driver_pay_cents)),
              fuel_cents: money(sumBy(detailRows, (r) => r.fuel_cents)),
              margin_cents: money(sumBy(detailRows, (r) => r.margin_cents)),
            }}
          />
        ) : (
          <ParityTable
            rows={groups}
            title={`By ${GROUP_OPTIONS.find((g) => g.id === by)?.label.toLowerCase()}`}
            columns={groupColumns}
            rowKey={(g) => g.key}
            loading={query.isPending}
            storageKey={`loads-report-board-${by}`}
            emptyText="No loads match these filters."
            exportFilename={`loads-report-by-${by}`}
            exportExcel
            footerCells={{
              label: <span className="font-semibold text-[#111827]">{groups.length} groups</span>,
              loads: String(totals.loads),
              revenue: money(totals.revenue),
              miles: formatNumber(totals.miles),
              emptyMiles: formatNumber(totals.emptyMiles),
              emptyPct: pctLabel(pct(totals.emptyMiles, totals.miles + totals.emptyMiles)),
              rpm: perMile(totals.revenue, totals.miles),
              driverPay: money(totals.driverPay),
              payPct: pctLabel(pct(totals.driverPay, totals.revenue)),
              fuel: money(totals.fuel),
              margin: money(totals.margin),
              customers: String(totals.customers),
              trucks: String(totals.trucks),
            }}
          />
        )}

        <ReportMeasuredNote>
          Empty miles are mdata.loads.miles_deadhead summed over the same filtered rows as Loaded miles and Revenue.
          Fuel and Margin stay as additive columns. Each group opens its loads; each load, customer, driver, truck,
          invoice, advance and settlement opens its record.
        </ReportMeasuredNote>
      </div>
    </ReportBoardShell>
  );
}
