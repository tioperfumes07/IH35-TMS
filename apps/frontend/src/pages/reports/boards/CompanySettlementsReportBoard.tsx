/**
 * Row 81 (11-03 register) — Reports › Company settlement report, board docs/design/v3/V3-Reports-CompanySettlements.dc.html.
 * Profit per closed trip from the SAME engine as Settlements › Company: GET /api/v1/driver-finance/tours?state=closed
 * (listTours — the tour readout: revenue, costs, driver pay, margin per tour). No second profit engine.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listTours, type TourListRow } from "../../../api/tourReadout";
import { EntityMultiSelect, entityFilterIds } from "../../../components/EntityMultiSelect";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ReportFilterBar } from "../../../components/reports/ReportFilterBar";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useStagedListFilters } from "../../../components/table";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { companyToday } from "../../../lib/businessDate";
import { mmmDd } from "../../../lib/formatDate";
import { formatPersonName } from "../../../lib/formatPersonName";
import { formatUsdCents } from "../../../lib/money";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { ReportBoardShell, ReportKpiGrid, ReportMeasuredNote } from "./ReportBoardShell";
import { groupBy, monthKey, pct, pctLabel, sumBy, weekStartIso } from "./reportBoardGroup";

type GroupBy = "trip" | "driver" | "truck" | "week" | "month";
const GROUP_OPTIONS: Array<{ id: GroupBy; label: string }> = [
  { id: "trip", label: "Trip" },
  { id: "driver", label: "Driver" },
  { id: "truck", label: "Truck" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

type Filters = { start: string; end: string; driverId: string; unitId: string };
type Trip = TourListRow & { closed_date: string };
type GroupRow = {
  key: string;
  label: string;
  link: { kind: "driver" | "unit"; id: string } | null;
  trips: number;
  revenue: number;
  costs: number;
  driverPay: number;
  margin: number;
};

const money = (cents: number) => formatUsdCents(cents);

/** Central business date of the trip close (the tour's trip_closed_at; period_end when the stamp is missing). */
function closedDate(t: TourListRow): string {
  if (t.trip_closed_at) {
    const d = new Date(t.trip_closed_at);
    if (Number.isFinite(d.getTime())) return companyToday(d);
  }
  return t.period_end ?? "";
}

export function CompanySettlementsReportBoard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const emptyFilters: Filters = { start: `${companyToday().slice(0, 4)}-01-01`, end: companyToday(), driverId: "", unitId: "" };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({ applied, empty: emptyFilters, onApply: setApplied });
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  // ROUND 8.20 board29 — group/drill/zero_cost in URL so KPI Open list + Back restore cohort.
  const groupFromUrl = (searchParams.get("group") ?? "trip") as GroupBy;
  const by: GroupBy = GROUP_OPTIONS.some((g) => g.id === groupFromUrl) ? groupFromUrl : "trip";
  const drillKey = searchParams.get("drill");
  const drillLabel = searchParams.get("drill_label");
  const drill = drillKey ? { key: drillKey, label: drillLabel || drillKey } : null;
  const zeroCostOnly = searchParams.get("zero_cost") === "1";
  const setBy = (next: GroupBy) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "trip") p.delete("group");
        else p.set("group", next);
        p.delete("drill");
        p.delete("drill_label");
        return p;
      },
      { replace: true },
    );
  };
  const setDrill = (next: { key: string; label: string } | null) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!next) {
          p.delete("drill");
          p.delete("drill_label");
        } else {
          p.set("drill", next.key);
          if (next.label && next.label !== next.key) p.set("drill_label", next.label);
          else p.delete("drill_label");
        }
        return p;
      },
      { replace: true },
    );
  };
  const openZeroCostList = () => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("zero_cost", "1");
        p.delete("group");
        p.delete("drill");
        p.delete("drill_label");
        return p;
      },
      { replace: true },
    );
  };

  const query = useQuery({
    queryKey: ["reports", "company-settlements-board", companyId],
    queryFn: () => listTours(companyId, "closed"),
    enabled: Boolean(companyId),
    retry: false,
  });

  const trips = useMemo<Trip[]>(() => {
    const drivers = entityFilterIds(applied.driverId);
    const units = entityFilterIds(applied.unitId);
    const q = search.trim().toLowerCase();
    return (query.data?.rows ?? [])
      .map((t) => ({ ...t, closed_date: closedDate(t) }))
      .filter((t) => t.closed_date >= applied.start && t.closed_date <= applied.end)
      .filter((t) => !drivers.length || (t.driver_id != null && drivers.includes(t.driver_id)))
      .filter((t) => !units.length || t.legs.some((l) => l.unit_id != null && units.includes(l.unit_id)) || (t.unit_id != null && units.includes(t.unit_id)))
      .filter(
        (t) =>
          !q ||
          [t.display_id, t.settlement_number, t.company_settlement_display_id, t.driver_name, t.unit_number, t.legs_label].some((v) =>
            String(v ?? "").toLowerCase().includes(q)
          )
      )
      .sort((a, b) => b.closed_date.localeCompare(a.closed_date));
  }, [query.data?.rows, applied, search]);

  const totals = useMemo(
    () => ({
      trips: trips.length,
      withCompany: trips.filter((t) => t.company_settlement_id).length,
      revenue: sumBy(trips, (t) => t.revenue_cents),
      costs: sumBy(trips, (t) => t.costs_cents),
      driverPay: sumBy(trips, (t) => t.driver_pay_cents),
      margin: sumBy(trips, (t) => t.margin_cents),
      zeroCost: trips.filter((t) => !t.costs_cents),
    }),
    [trips]
  );

  const keyOf = (t: Trip, g: GroupBy) =>
    g === "driver"
      ? t.driver_id ?? "none"
      : g === "truck"
        ? t.unit_id ?? "none"
        : g === "week"
          ? weekStartIso(t.closed_date)
          : g === "month"
            ? monthKey(t.closed_date)
            : t.settlement_id;

  const groups = useMemo<GroupRow[]>(() => {
    if (by === "trip") return [];
    const out: GroupRow[] = [];
    for (const [key, list] of groupBy(trips, (t) => keyOf(t, by))) {
      const first = list[0];
      const label =
        by === "driver"
          ? first.driver_name
            ? formatPersonName(first.driver_name)
            : "No driver"
          : by === "truck"
            ? first.unit_number ?? "No truck"
            : by === "week"
              ? `Week of ${mmmDd(key)}`
              : `${key.slice(5, 7)}/${key.slice(0, 4)}`;
      const link =
        by === "driver" && first.driver_id ? ({ kind: "driver", id: first.driver_id } as const) : by === "truck" && first.unit_id ? ({ kind: "unit", id: first.unit_id } as const) : null;
      out.push({
        key,
        label,
        link,
        trips: list.length,
        revenue: sumBy(list, (t) => t.revenue_cents),
        costs: sumBy(list, (t) => t.costs_cents),
        driverPay: sumBy(list, (t) => t.driver_pay_cents),
        margin: sumBy(list, (t) => t.margin_cents),
      });
    }
    return by === "week" || by === "month" ? out.sort((a, b) => b.key.localeCompare(a.key)) : out.sort((a, b) => b.margin - a.margin);
  }, [trips, by]);

  const detail = useMemo(() => {
    let list = drill ? trips.filter((t) => keyOf(t, by) === drill.key) : trips;
    if (zeroCostOnly) list = list.filter((t) => !t.costs_cents);
    return list;
  }, [trips, drill, by, zeroCostOnly]);
  const showDetail = by === "trip" || drill != null || zeroCostOnly;

  const tripColumns = useMemo<ParityColumn<Trip>[]>(
    () => [
      {
        key: "company_settlement_display_id",
        label: "Company stl.",
        sortable: true,
        render: (t) =>
          t.company_settlement_id ? (
            <EntityLink kind="company_settlement" id={t.company_settlement_id} label={t.company_settlement_display_id ?? "Company settlement"} />
          ) : (
            <span className="text-[#B45309]">not opened</span>
          ),
      },
      { key: "display_id", label: "Driver stl.", sortable: true, render: (t) => <EntityLink kind="settlement" id={t.settlement_id} label={t.display_id ?? "Settlement"} /> },
      { key: "settlement_number", label: "Number", sortable: true, render: (t) => t.settlement_number ?? "—" },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (t) => <EntityLink kind="driver" id={t.driver_id} label={t.driver_name ? formatPersonName(t.driver_name) : "Driver"} />,
      },
      { key: "unit_number", label: "Truck", sortable: true, render: (t) => <EntityLink kind="unit" id={t.unit_id} label={t.unit_number ?? "Unit"} /> },
      {
        key: "legs_label",
        label: "Legs",
        sortable: true,
        render: (t) => (
          <span className="inline-flex flex-wrap items-center gap-1">
            {t.legs.map((l, i) => (
              <span key={l.load_id} className="inline-flex items-center gap-1">
                {i > 0 ? <span>→</span> : null}
                <EntityLink kind="load" id={l.load_id} label={`${l.trip_type ?? ""} ${l.load_number}`.trim()} />
              </span>
            ))}
          </span>
        ),
      },
      { key: "closed_date", label: "Closed", sortable: true, render: (t) => mmmDd(t.closed_date) || "—" },
      { key: "revenue_cents", label: "Revenue", sortable: true, cellClass: "text-right", className: "text-right", render: (t) => money(t.revenue_cents) },
      { key: "costs_cents", label: "Costs", sortable: true, cellClass: "text-right", className: "text-right", render: (t) => money(t.costs_cents) },
      { key: "driver_pay_cents", label: "Driver pay", sortable: true, cellClass: "text-right", className: "text-right", render: (t) => money(t.driver_pay_cents) },
      { key: "margin_cents", label: "Margin", sortable: true, cellClass: "text-right", className: "text-right", render: (t) => money(t.margin_cents) },
      { key: "margin_pct", label: "Margin %", sortable: true, cellClass: "text-right", className: "text-right", render: (t) => pctLabel(t.margin_pct) },
    ],
    []
  );

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
            <button type="button" className="font-semibold text-[#1D4ED8] hover:underline" onClick={() => setDrill({ key: g.key, label: g.label })}>
              {g.label}
            </button>
          ),
      },
      {
        key: "trips",
        label: "Trips",
        sortable: true,
        sortValue: (g) => g.trips,
        cellClass: "text-right",
        className: "text-right",
        render: (g) => (
          <button type="button" className="text-[#1D4ED8] hover:underline" onClick={() => setDrill({ key: g.key, label: g.label })}>
            {g.trips}
          </button>
        ),
      },
      { key: "revenue", label: "Revenue", sortable: true, sortValue: (g) => g.revenue, cellClass: "text-right", className: "text-right", render: (g) => money(g.revenue) },
      { key: "costs", label: "Costs", sortable: true, sortValue: (g) => g.costs, cellClass: "text-right", className: "text-right", render: (g) => money(g.costs) },
      { key: "driverPay", label: "Driver pay", sortable: true, sortValue: (g) => g.driverPay, cellClass: "text-right", className: "text-right", render: (g) => money(g.driverPay) },
      { key: "margin", label: "Margin", sortable: true, sortValue: (g) => g.margin, cellClass: "text-right", className: "text-right", render: (g) => money(g.margin) },
      { key: "marginPct", label: "Margin %", sortable: true, sortValue: (g) => pct(g.margin, g.revenue) ?? 0, cellClass: "text-right", className: "text-right", render: (g) => pctLabel(pct(g.margin, g.revenue)) },
    ],
    [by]
  );

  const xlsx = () =>
    showDetail
      ? {
          filename: "company-settlement-report",
          header: ["Company stl.", "Driver stl.", "Number", "Driver", "Truck", "Legs", "Closed", "Revenue", "Costs", "Driver pay", "Margin", "Margin %"],
          body: detail.map((t) => [
            t.company_settlement_display_id ?? "not opened",
            t.display_id ?? "",
            t.settlement_number ?? "",
            formatPersonName(t.driver_name ?? ""),
            t.unit_number ?? "",
            t.legs.map((l) => `${l.trip_type ?? ""} ${l.load_number}`.trim()).join(" → "),
            mmmDd(t.closed_date),
            t.revenue_cents / 100,
            t.costs_cents / 100,
            t.driver_pay_cents / 100,
            t.margin_cents / 100,
            t.margin_pct ?? "",
          ]),
        }
      : {
          filename: `company-settlement-report-by-${by}`,
          header: [GROUP_OPTIONS.find((g) => g.id === by)?.label ?? "Group", "Trips", "Revenue", "Costs", "Driver pay", "Margin"],
          body: groups.map((g) => [g.label, g.trips, g.revenue / 100, g.costs / 100, g.driverPay / 100, g.margin / 100]),
        };

  return (
    <ReportBoardShell
      id="company-settlements-report"
      subtitle="profit per closed trip · revenue − costs − driver pay · source: closed tours (same engine as Settlements › Company)"
      xlsx={xlsx}
    >
      <ReportFilterBar
        testIdPrefix="reports-company-settlements"
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

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[#111827]">Group by</span>
        <V3Segmented
          value={by}
          options={GROUP_OPTIONS}
          onChange={(next) => setBy(next)}
          testId="company-settlements-report-group-by"
        />
        <span className="text-[#5B6576]">dated by trip close (Central)</span>
      </div>

      {query.isError ? (
        <ListErrorState title="Couldn't load the company settlement report" {...formatQueryErrorDetail(query.error)} onRetry={() => void query.refetch()} />
      ) : null}

      <ReportKpiGrid>
        {/* ROUND 8.17 class S — KPI tiles open the report table / settlements source. */}
        <V3KpiTile
          testId="csr-kpi-trips"
          label="Closed trips"
          value={query.data ? String(totals.trips) : "…"}
          sub={`${totals.withCompany} with a company settlement`}
          href="/driver-finance/settlements?tab=closed"
        />
        <V3KpiTile
          testId="csr-kpi-revenue"
          label="Revenue"
          value={query.data ? money(totals.revenue) : "…"}
          onClick={() => document.querySelector('[data-testid="csr-table"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <V3KpiTile
          testId="csr-kpi-costs"
          label="Costs"
          value={query.data ? money(totals.costs) : "…"}
          sub="fuel · tolls · maintenance on load"
          href="/accounting/expenses"
        />
        <V3KpiTile
          testId="csr-kpi-driver-pay"
          label="Driver pay"
          value={query.data ? money(totals.driverPay) : "…"}
          href="/driver-finance/settlements?tab=payments"
        />
        <V3KpiTile
          testId="csr-kpi-margin"
          label="Margin"
          value={query.data ? money(totals.margin) : "…"}
          sub={`${pctLabel(pct(totals.margin, totals.revenue))} of revenue`}
          tone={totals.margin < 0 ? "red" : "green"}
          onClick={() => document.querySelector('[data-testid="csr-table"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <V3KpiTile
          testId="csr-kpi-zero-cost"
          label="Trips with $0 costs"
          value={query.data ? String(totals.zeroCost.length) : "…"}
          sub="no fuel or expense linked"
          tone={totals.zeroCost.length ? "amber" : "muted"}
          onClick={() => {
            openZeroCostList();
            document.querySelector('[data-testid="csr-table"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      </ReportKpiGrid>

      {drill || zeroCostOnly ? (
        <div className="flex items-center gap-2 text-xs text-[#5B6576]">
          <span>
            {zeroCostOnly ? (
              <>
                Trips with <strong className="text-[#111827]">$0 costs</strong>
              </>
            ) : (
              <>
                Trips in <strong className="text-[#111827]">{drill?.label}</strong>
              </>
            )}
          </span>
          <button
            type="button"
            className="font-semibold text-[#1D4ED8] hover:underline"
            onClick={() => {
              if (zeroCostOnly) {
                setSearchParams(
                  (prev) => {
                    const p = new URLSearchParams(prev);
                    p.delete("zero_cost");
                    return p;
                  },
                  { replace: true },
                );
              } else {
                setDrill(null);
              }
            }}
          >
            ← back
          </button>
        </div>
      ) : null}

      {showDetail ? (
        <ParityTable
          rows={detail}
          title={`${detail.length} closed trips · newest first`}
          columns={tripColumns}
          rowKey={(t) => t.settlement_id}
          loading={query.isPending}
          storageKey="company-settlements-report-board"
          tableTestId="csr-table"
          emptyText="No closed trips match these filters."
          exportFilename="company-settlement-report"
          exportExcel
          minWidthPx={1400}
          footerCells={{
            company_settlement_display_id: <span className="font-semibold text-[#111827]">Totals ({detail.length})</span>,
            revenue_cents: money(sumBy(detail, (t) => t.revenue_cents)),
            costs_cents: money(sumBy(detail, (t) => t.costs_cents)),
            driver_pay_cents: money(sumBy(detail, (t) => t.driver_pay_cents)),
            margin_cents: money(sumBy(detail, (t) => t.margin_cents)),
            margin_pct: pctLabel(pct(sumBy(detail, (t) => t.margin_cents), sumBy(detail, (t) => t.revenue_cents))),
          }}
        />
      ) : (
        <ParityTable
          rows={groups}
          title={`By ${GROUP_OPTIONS.find((g) => g.id === by)?.label.toLowerCase()}`}
          columns={groupColumns}
          rowKey={(g) => g.key}
          loading={query.isPending}
          storageKey={`company-settlements-report-board-${by}`}
          tableTestId="csr-table"
          emptyText="No closed trips match these filters."
          exportFilename={`company-settlement-report-by-${by}`}
          exportExcel
          footerCells={{
            label: <span className="font-semibold text-[#111827]">{groups.length} groups</span>,
            trips: String(totals.trips),
            revenue: money(totals.revenue),
            costs: money(totals.costs),
            driverPay: money(totals.driverPay),
            margin: money(totals.margin),
            marginPct: pctLabel(pct(totals.margin, totals.revenue)),
          }}
        />
      )}

      {query.data ? (
        <div data-testid="csr-measured">
          <ReportMeasuredNote>
            {totals.zeroCost.length
              ? `${totals.zeroCost.map((t) => t.display_id ?? t.settlement_id).join(", ")} show $0 costs, so their margins are overstated until their fuel and expenses are linked. `
              : "Every closed trip in range carries costs. "}
            {totals.trips - totals.withCompany} closed trips have no company settlement opened. Each trip opens its company settlement; each leg opens the load.
          </ReportMeasuredNote>
        </div>
      ) : null}
    </ReportBoardShell>
  );
}
