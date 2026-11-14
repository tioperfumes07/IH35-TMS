// TABLE_DATE_OMIT: this table has no date column by design (not a time-series view).

import { useEffect, useMemo, useState } from "react";
import { settlementNumber } from "../../lib/settlementNumber";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { ListErrorState } from "../../components/ListErrorState";
import { BoardSection } from "../../components/v3/BoardSection";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { mmmDd } from "../../lib/formatDate";
import { getOpenDriverBills, listSettlements, type SettlementListRow } from "../../api/driverFinance";
import { listTours, type TourListRow } from "../../api/tourReadout";
import { TourLegsCell } from "../../components/dispatch/TourLegsCell";
import { TourPreSettlementTab } from "../../components/dispatch/TourPreSettlementTab";
import { TourSettlementTab } from "../../components/dispatch/TourSettlementTab";
import { formatQuantityTable, formatUsd, formatUsdCents } from "../../lib/money";
import { formatDisplayName } from "../../components/v3/formatDisplayName";
import { V3 } from "../../design/v3-tokens";
import { preSettlementsYtdSub, S443326 } from "./settlementsV3BoardStrings";
import "../../assets/fonts/v3-maintenance/board-box.css";

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function isInThisPeriod(s: SettlementListRow, periodStart: Date): boolean {
  const end = new Date(s.period_end);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() >= periodStart.getTime();
}

function isYtd(s: SettlementListRow, year: number): boolean {
  const end = new Date(s.period_end);
  return !Number.isNaN(end.getTime()) && end.getFullYear() === year;
}

const display = (v: string | number | null) => (v === null || v === undefined ? "—" : String(v));

// ROUND 443.252 / 443.274-C Settlements-Open board: Settlement column shows the number as a
// statement link — AlwaysTrack doc when closed (5851…), else the P-series display_id (P-0115)
// while open. Never a status word ("Open") and never the retired S-YYYY-NNNN counter.
const tourLabel = (r: TourListRow) => {
  const at = settlementNumber(r);
  if (at) return at;
  const did = (r.display_id ?? "").trim();
  if (/^P-\d+/i.test(did)) return did;
  // Refuse status words / retired S-counter so the board never re-renders "Open".
  if (did && !/^S-\d{4}-\d+/i.test(did) && did.toLowerCase() !== "open" && did.toLowerCase() !== "pending") {
    return did;
  }
  // ROUND 8.17 residual — TourListRow has is_open (not is_presettlement); open + no AlwaysTrack → PENDING.
  if (r.is_open) return "PENDING";
  return "No number";
};

/** T5 / ROUND 8.12 — Ready dots follow engine ready_total (never hard-code six). */
function ReadyDots({ ok, total }: { ok: number; total: number }) {
  const n = Math.max(0, Number.isFinite(total) ? total : 0);
  if (n <= 0) {
    return (
      <span className="tabular-nums text-section-header text-[#6B7280]" data-testid="setl-tour-ready-dots" aria-label="Ready checks not measured">
        —
      </span>
    );
  }
  const passed = Math.max(0, Math.min(ok, n));
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`${passed}/${n} ready checks`}
      data-testid="setl-tour-ready-dots"
      aria-label={`${passed} of ${n} ready`}
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-sm"
          style={{ background: i < passed ? "#14314F" : "#D1D5DB" }}
          data-ready={i < passed ? "1" : "0"}
        />
      ))}
      <span className="ml-1 tabular-nums text-section-header text-[#6B7280]">{passed}/{n}</span>
    </span>
  );
}

/** Waiting on = this row's first hard blocker only (never a global pasted reason). */
function waitingOnReason(r: TourListRow): string {
  return (r.close_blockers[0] ?? "").trim();
}

// SETL-MOD-01 (ROUND 9, owner "get to work on the real settlements module"): the SETTLEMENTS
// module list reads the SAME readout as the Load-costs Pre-Settlement / Settlement tabs —
// GET /api/v1/driver-finance/tours?state=open|closed via listTours() (api/tourReadout.ts), one row
// per tour, expanded to the SAME TourPreSettlementTab / TourSettlementTab keyed by settlement_id.
// Columns and palette (.ldt-*) mirror LoadCostsBoardPage's TourRegister so the two surfaces show one
// truth; the Tour link routes to /driver-finance/settlements?settlement_id= so the existing detail view keeps working.
// R90-33/34: no "$" prefix on money columns per design census.
const fmtNoSign = (c: number) => formatUsdCents(c).replace(/^\$/, "");
const fmt = (c: number) => fmtNoSign(c);
const DASH = "\u2014";

/** Closed board: "No number" is red when a closed row still lacks AlwaysTrack (443.252 measured). */
/** Lead 443.278 (1): the ORIGINAL load's dates drill to that load. Its id is the live leg whose
 *  load_number is the origin; a cancelled origin (not a live leg) renders the date as plain text. */
function OriginDateCell({ row, date }: { row: TourListRow; date: string | null }) {
  if (!date) return <>{DASH}</>;
  const originId = row.origin_load_number ? row.legs.find((l) => l.load_number === row.origin_load_number)?.load_id ?? null : null;
  const label = mmmDd(date);
  if (!originId) return <span title={row.origin_load_number ? `Load ${row.origin_load_number}` : undefined}>{label}</span>;
  return (
    <EntityLink
      kind="load"
      id={originId}
      label={label}
      className="ldt-link"
      title={`Original load ${row.origin_load_number}`}
      data-testid="setl-tour-origin-load-link"
    />
  );
}

function SettlementCell({ row }: { row: TourListRow }) {
  const label = tourLabel(row);
  const noNumber = label === "No number";
  return (
    <EntityLink
      kind="settlement"
      id={row.settlement_id}
      label={label}
      className={noNumber ? "font-bold text-[#B91C1C]" : "ldt-link font-semibold"}
      data-testid={noNumber ? "setl-tour-no-number" : undefined}
    />
  );
}

/** Closed board: Company settlement opens its statement; else amber "not opened". */
function CompanySettlementCell({ row }: { row: TourListRow }) {
  const id = row.company_settlement_id;
  const label = (row.company_settlement_display_id ?? "").trim() || "Company settlement";
  if (id) {
    return (
      <EntityLink
        kind="company_settlement"
        id={id}
        label={label}
        className="ldt-link font-semibold"
        data-testid="setl-tour-company-link"
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="setl-tour-company-not-opened">
      <span className="inline-block h-1.5 w-1.5 rounded-sm bg-[#B45309]" aria-hidden />
      <span className="text-[#B45309]">not opened</span>
    </span>
  );
}

/** ROUND 8.15b — exact Settlements-Open|Closed.dc.html columns (OWNER-REMOVE 2026-11-12). */
const TOUR_COLUMNS = (state: "open" | "closed", _companyId: string, _rows: readonly TourListRow[]): ParityColumn<TourListRow>[] => [
  { key: "tour", label: "Settlement", alwaysVisible: true, testId: "setl-tour-col-id", sortable: true, className: "whitespace-nowrap", minWidth: 90, sortValue: r => tourLabel(r), render: r => <SettlementCell row={r} /> },
  {
    key: "driver",
    label: "Driver",
    testId: "setl-tour-col-driver",
    sortable: true,
    minWidth: 140,
    maxWidth: 220,
    cellClass: "whitespace-nowrap",
    sortValue: (r) => r.driver_name ?? "",
    render: (r) => (
      <EntityLinkOrTombstone
        kind="driver"
        id={r.driver_id}
        name={formatDisplayName(r.driver_name)}
        noun="Driver"
        className="block max-w-[200px] truncate"
      />
    ),
  },
  {
    key: "unit",
    label: "Unit",
    testId: "setl-tour-col-unit",
    sortable: true,
    minWidth: 56,
    maxWidth: 64,
    className: "whitespace-nowrap",
    sortValue: (r) => r.unit_number ?? "",
    render: (r) => <EntityLinkOrTombstone kind="unit" id={r.unit_id} name={r.unit_number} noun="Unit" />,
  },
  {
    key: "tour_legs",
    label: "Tour legs",
    alwaysVisible: true,
    testId: "setl-tour-col-tour-legs",
    sortable: true,
    minWidth: 160,
    maxWidth: 280,
    cellClass: "whitespace-nowrap",
    sortValue: (r) => r.leg_count,
    exportValue: (r) => (r.legs ?? []).map((l) => `${l.trip_type ?? "?"} ${l.load_number}`).join(" → "),
    render: (r) => <TourLegsCell legs={r.legs} />,
  },
  { key: "origin_started", label: "PU date", testId: "setl-tour-col-origin-started", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, headerTitle: "Pickup date of the ORIGINAL load that created this settlement", sortValue: r => r.origin_pickup_date ?? "", exportValue: r => (r.origin_pickup_date ? mmmDd(r.origin_pickup_date) : ""), render: r => <OriginDateCell row={r} date={r.origin_pickup_date} /> },
  { key: "origin_delivered", label: "DEL date", testId: "setl-tour-col-origin-delivered", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, headerTitle: "Delivery date of the ORIGINAL load that created this settlement", sortValue: r => r.origin_delivery_date ?? "", exportValue: r => (r.origin_delivery_date ? mmmDd(r.origin_delivery_date) : ""), render: r => <OriginDateCell row={r} date={r.origin_delivery_date} /> },
  ...(state === "closed"
    ? [{ key: "closed", label: "Ended", testId: "setl-tour-col-closed", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, sortValue: (r: TourListRow) => r.trip_closed_at ?? "", render: (r: TourListRow) => (r.trip_closed_at ? mmmDd(r.trip_closed_at) : DASH) } as ParityColumn<TourListRow>]
    : []),
  {
    key: "revenue",
    label: "Revenue",
    testId: "setl-tour-col-revenue",
    sortable: true,
    cellClass: "whitespace-nowrap text-right tabular-nums",
    minWidth: 100,
    maxWidth: 140,
    sortValue: (r) => r.revenue_cents,
    // ROUND 8.17 class S — money opens the settlement statement source.
    render: (r) => <MoneyCell cents={r.revenue_cents} format={fmtNoSign} drill={{ entity: { kind: "settlement", id: r.settlement_id } }} />,
  },
  {
    key: "costs",
    label: "Costs",
    testId: "setl-tour-col-costs",
    sortable: true,
    cellClass: "whitespace-nowrap text-right tabular-nums",
    minWidth: 100,
    maxWidth: 140,
    sortValue: (r) => r.costs_cents,
    render: (r) => <MoneyCell cents={r.costs_cents} format={fmtNoSign} drill={{ entity: { kind: "settlement", id: r.settlement_id } }} />,
  },
  {
    key: "driver_pay",
    label: "Driver pay",
    testId: "setl-tour-col-driver-pay",
    sortable: true,
    cellClass: "whitespace-nowrap text-right tabular-nums",
    minWidth: 100,
    maxWidth: 140,
    sortValue: (r) => r.driver_pay_cents,
    render: (r) => <MoneyCell cents={r.driver_pay_cents} format={fmtNoSign} drill={{ entity: { kind: "settlement", id: r.settlement_id } }} />,
  },
  {
    key: "margin",
    label: "Margin",
    testId: "setl-tour-col-margin",
    sortable: true,
    cellClass: "whitespace-nowrap text-right tabular-nums font-bold",
    minWidth: 100,
    maxWidth: 140,
    sortValue: (r) => r.margin_cents,
    render: (r) => (
      <span className={r.margin_cents < 0 ? "font-bold text-[#991B1B]" : "font-bold"}>
        <MoneyCell cents={r.margin_cents} format={fmtNoSign} drill={{ entity: { kind: "settlement", id: r.settlement_id } }} />
      </span>
    ),
  },
  ...(state === "open"
    ? [
        { key: "miles_practical", label: "Practical mi", testId: "setl-tour-col-miles_practical", sortable: true, cellClass: "whitespace-nowrap tabular-nums", sortValue: (r: TourListRow) => r.miles_practical ?? -Infinity, render: (r: TourListRow) => (r.miles_practical == null ? DASH : formatQuantityTable(r.miles_practical, 0)) } as ParityColumn<TourListRow>,
        { key: "miles_real", label: "Real mi", testId: "setl-tour-col-miles_real", sortable: true, cellClass: "whitespace-nowrap tabular-nums", sortValue: (r: TourListRow) => r.miles_real ?? -Infinity, render: (r: TourListRow) => (r.miles_real == null ? DASH : formatQuantityTable(r.miles_real, 0)) } as ParityColumn<TourListRow>,
        { key: "ready", label: "Ready", testId: "setl-tour-col-ready", sortable: true, minWidth: 100, maxWidth: 140, sortValue: (r: TourListRow) => r.ready_ok, render: (r: TourListRow) => <ReadyDots ok={r.ready_ok} total={r.ready_total} /> } as ParityColumn<TourListRow>,
        {
          key: "close_blockers",
          label: "Waiting on",
          testId: "setl-tour-col-open-items",
          sortable: true,
          minWidth: 160,
          maxWidth: 280,
          sortValue: (r: TourListRow) => waitingOnReason(r),
          render: (r: TourListRow) => {
            const reason = waitingOnReason(r);
            return reason ? (
              <span title={r.close_blockers.join("\n")} data-testid="setl-tour-first-blocker" className="block max-w-[260px] truncate text-left">
                {reason}
              </span>
            ) : (
              DASH
            );
          },
        } as ParityColumn<TourListRow>,
      ]
    : [
        {
          key: "net",
          label: "Driver net",
          testId: "setl-tour-col-driver-net",
          sortable: true,
          cellClass: "whitespace-nowrap text-right tabular-nums font-bold",
          minWidth: 100,
          maxWidth: 140,
          sortValue: (r: TourListRow) => r.driver_net_cents ?? 0,
          render: (r: TourListRow) =>
            r.driver_net_cents == null ? (
              DASH
            ) : (
              <span className="font-bold tabular-nums">
                <MoneyCell cents={r.driver_net_cents} format={fmtNoSign} drill={{ entity: { kind: "settlement", id: r.settlement_id } }} />
              </span>
            ),
        } as ParityColumn<TourListRow>,
        { key: "company", label: "Company settlement", testId: "setl-tour-col-company", minWidth: 120, maxWidth: 160, cellClass: "whitespace-nowrap", render: (r: TourListRow) => <CompanySettlementCell row={r} /> } as ParityColumn<TourListRow>,
      ]),
];

/**
 * ROUND 8.15b / 443.280 — Settlements › Open / Closed exact board
 * (docs/design/v3/Settlements-Open|Closed.dc.html). Engines: listTours(open|closed).
 * Verify & Post lives on TourPreSettlementTab (detail) — not an extra list column.
 */
export function SettlementsToursRegister({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  // 443.280-A — Open / Closed are own Settlements tabs (?tab=open|closed). Prefer tab over legacy tour_state.
  const tabHint =
    searchParams.get("tab") === "open" || searchParams.get("tab") === "closed"
      ? searchParams.get("tab")
      : (searchParams.get("tour_state") ?? searchParams.get("tab"));
  const state: "open" | "closed" = tabHint === "closed" ? "closed" : "open";
  const setState = (next: "open" | "closed") => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    params.delete("tour_state");
    setSearchParams(params, { replace: true });
  };
  // ROUND 8.17 residual board 33/34 — Open/Closed must live in the URL so EntityLink `ret`
  // restores the cohort (Back must not land Settlements Home).
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "open" || tab === "closed") return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", state);
    params.delete("tour_state");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams, state]);
  const openQ = useQuery({ queryKey: ["settlements-module", "tours", "open", companyId], queryFn: () => listTours(companyId, "open"), enabled: Boolean(companyId) });
  const closedQ = useQuery({ queryKey: ["settlements-module", "tours", "closed", companyId], queryFn: () => listTours(companyId, "closed"), enabled: Boolean(companyId) });
  const activeQ = state === "open" ? openQ : closedQ;
  const rows = activeQ.data?.rows ?? [];
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [closedCount, setClosedCount] = useState<number | null>(null);
  useEffect(() => { if (openQ.data) setOpenCount(openQ.data.count); }, [openQ.data]);
  useEffect(() => { if (closedQ.data) setClosedCount(closedQ.data.count); }, [closedQ.data]);

  const kpiBaseQuery = useQuery({
    queryKey: ["driver-finance", "settlements-kpi-base", companyId, "tours-v3"],
    queryFn: () => listSettlements(companyId),
    enabled: Boolean(companyId),
  });
  const openBillsQuery = useQuery({
    queryKey: ["driver-finance", "open-driver-bills", companyId, "tours-v3"],
    queryFn: () => getOpenDriverBills(companyId),
    enabled: Boolean(companyId),
  });

  const periodStart = useMemo(() => startOfWeekSunday(new Date()), []);
  const ytdYear = new Date().getFullYear();
  const serverKpi = kpiBaseQuery.data?.kpi;
  const kpiSettlements = kpiBaseQuery.data?.settlements ?? [];
  const c = S443326.preSettlements;

  const totalUnpaid = kpiBaseQuery.isError
    ? null
    : (serverKpi?.total_unpaid ?? kpiSettlements.filter((s) => s.status !== "paid").length);
  const thisPeriod = kpiBaseQuery.isError
    ? null
    : (serverKpi?.this_period ?? kpiSettlements.filter((s) => isInThisPeriod(s, periodStart)).length);
  const driverPayThisPeriod = kpiBaseQuery.isError
    ? null
    : serverKpi != null
      ? formatUsd(Number(serverKpi.driver_pay_this_period ?? 0))
      : formatUsd(
          kpiSettlements
            .filter((s) => isInThisPeriod(s, periodStart) && s.status !== "cancelled")
            .reduce((sum, s) => sum + Number(s.net_pay ?? 0), 0),
        );
  const driversWithDebt = kpiBaseQuery.isError
    ? null
    : (serverKpi?.drivers_with_debt ??
      kpiSettlements.filter((s) => typeof s.live_debt_flag === "number" && s.live_debt_flag > 0).length);
  const ytdSettlements = kpiBaseQuery.isError
    ? null
    : (serverKpi?.ytd_settlements ?? kpiSettlements.filter((s) => isYtd(s, ytdYear)).length);
  const openBills = openBillsQuery.isError
    ? null
    : (openBillsQuery.data?.open_driver_bills?.total_count ?? null);

  const driverPaySub = useMemo(() => {
    if (kpiBaseQuery.isError) return c.kpiDriverPaySubSum;
    const thisWeekStart = periodStart.getTime();
    const lastWeekStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;
    let thisNet = 0;
    let lastNet = 0;
    for (const s of kpiSettlements) {
      if (s.status === "cancelled") continue;
      const end = new Date(s.period_end).getTime();
      if (Number.isNaN(end)) continue;
      if (end >= thisWeekStart) thisNet += Number(s.net_pay ?? 0);
      else if (end >= lastWeekStart && end < thisWeekStart) lastNet += Number(s.net_pay ?? 0);
    }
    const delta = thisNet - lastNet;
    if (delta === 0) return c.kpiDriverPaySubFlat;
    if (delta > 0) {
      return (
        <span style={{ fontWeight: 600, color: V3.green }} data-testid="settlements-tours-kpi-pay-trend">
          {c.kpiDriverPaySubUp}
        </span>
      );
    }
    return (
      <span style={{ fontWeight: 600, color: V3.red }} data-testid="settlements-tours-kpi-pay-trend">
        {c.kpiDriverPaySubDown}
      </span>
    );
  }, [c.kpiDriverPaySubDown, c.kpiDriverPaySubFlat, c.kpiDriverPaySubSum, c.kpiDriverPaySubUp, kpiBaseQuery.isError, kpiSettlements, periodStart]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.driver_name,
        r.unit_number,
        r.display_id,
        r.settlement_id,
        tourLabel(r),
        waitingOnReason(r),
        ...(r.legs ?? []).map((l) => l.load_number),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const panelTitle = state === "closed" ? "Closed settlements" : "Open tours · pre-settlements";

  return (
    <div
      className="space-y-3"
      data-testid="settlements-tours-view"
      data-surface="load-detail"
      data-settlements-tours-v3="1"
      data-v3-board="Settlements-Open"
      style={{ lineHeight: "normal" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: 8,
          fontFamily: V3.font,
        }}
        data-testid="settlements-tours-kpi-strip"
        data-settlements-tours-v3-kpis="1"
      >
        <V3KpiTile
          label={c.kpiTotalUnpaid}
          value={display(totalUnpaid === null ? null : Math.round(Number(totalUnpaid)))}
          sub={c.kpiTotalUnpaidSub}
          testId="settlements-tours-kpi-total-unpaid"
          href="/driver-finance/settlements?tab=payments&payment_state=unpaid"
        />
        <V3KpiTile
          label={c.kpiThisPeriod}
          value={display(thisPeriod === null ? null : Math.round(Number(thisPeriod)))}
          sub={c.kpiThisPeriodSub}
          testId="settlements-tours-kpi-this-period"
          href="/driver-finance/settlements"
        />
        <V3KpiTile
          label={c.kpiDriverPay}
          value={display(driverPayThisPeriod)}
          sub={driverPaySub}
          testId="settlements-tours-kpi-driver-pay"
          href="/driver-finance/settlements?tab=payments"
        />
        <V3KpiTile
          label={c.kpiDriversDebt}
          value={display(driversWithDebt === null ? null : Math.round(Number(driversWithDebt)))}
          sub={c.kpiDriversDebtSub}
          tone={typeof driversWithDebt === "number" && driversWithDebt > 0 ? "red" : "ink"}
          testId="settlements-tours-kpi-debt"
          href="/driver-finance/settlements?tab=payments&focus=debt"
        />
        <V3KpiTile
          label={c.kpiYtd}
          value={display(ytdSettlements === null ? null : Math.round(Number(ytdSettlements)))}
          sub={preSettlementsYtdSub(ytdYear)}
          testId="settlements-tours-kpi-ytd"
          href="/driver-finance/settlements"
        />
        <V3KpiTile
          label={c.kpiOpenBills}
          value={display(openBills === null ? null : Math.round(openBills))}
          sub={c.kpiOpenBillsSub}
          testId="settlements-tours-kpi-open-bills"
          href="/driver-finance/settlements?tab=payments"
        />
      </div>

      {/* R90-33/34 segment row: left nav chips + right cohort pills + Filters + Export */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, fontFamily: V3.font }}
        data-testid="settlements-tours-segment-row"
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }} data-testid="settlements-tours-nav-chips">
          {[
            { label: "Company & Driver", href: "/driver-finance/settlements?view=company_driver" },
            { label: "Driver settlements", href: null as string | null, active: true },
            { label: "Company settlements", href: "/driver-finance/company-settlements" },
            { label: "Settlement Disputes", href: "/driver-finance/settlements?view=disputes" },
            { label: "Needs Review", href: "/driver-finance/settlements?view=needs_review" },
          ].map(({ label, href, active }) => (
            <button
              key={label}
              type="button"
              onClick={href ? () => navigate(href) : undefined}
              data-testid={`settlements-nav-chip-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              style={{ padding: "3px 10px", borderRadius: 3, border: `1px solid ${active ? V3.shell : V3.border}`, background: active ? V3.shell : V3.surface, color: active ? "#FFFFFF" : V3.ink, fontWeight: active ? 700 : 500, cursor: href ? "pointer" : "default", fontFamily: V3.font }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }} data-testid="settlements-tours-pills">
            {(["open", "closed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                data-testid={`settlements-tours-pill-${s}`}
                aria-pressed={state === s}
                onClick={() => setState(s)}
                className="ldt-btn"
                style={{ border: `1px solid ${state === s ? V3.link : V3.border}`, background: state === s ? V3.link : V3.surface, color: state === s ? "#FFFFFF" : V3.ink, fontWeight: state === s ? 700 : 500, fontFamily: V3.font }}
              >
                {s === "open" ? "Pre-Settlement (Open)" : "Settlement (Closed)"}
                <span className="text-[10px]" style={{ background: state === s ? "rgba(255,255,255,0.25)" : "#F3F4F6", borderRadius: 2, padding: "0 4px", color: state === s ? "#FFFFFF" : "#6B7280", fontWeight: 600, minWidth: 16, textAlign: "center" }}>
                  {(s === "open" ? openCount : closedCount) ?? "—"}
                </span>
              </button>
            ))}
          </div>
          <MoneyListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search settlements…"
            searchTestId="settlements-tours-search-input"
            activeFilterCount={0}
            onClearAll={() => setSearch("")}
            testIdPrefix="settlements-tours"
          >
            <button type="button" data-testid="settlements-tours-filter-btn" className="h-9 inline-flex items-center" style={{ padding: "0 12px", border: `1px solid ${V3.border}`, borderRadius: 6, background: V3.surface, color: V3.ink, fontSize: 12, fontWeight: 600, fontFamily: V3.font, cursor: "pointer" }}>Filters ▾</button>
            <button type="button" data-testid="settlements-tours-export-btn" className="h-9 inline-flex items-center" style={{ padding: "0 12px", border: `1px solid ${V3.border}`, borderRadius: 6, background: V3.surface, color: V3.ink, fontSize: 12, fontWeight: 600, fontFamily: V3.font, cursor: "pointer" }}>Export</button>
          </MoneyListToolbar>
        </div>
      </div>

      {/* R-102-B item 5 — cancelled/reversed permanently excluded (SETL-REVERSED-HIDE) */}
      <BoardSection
        title={panelTitle}
        testId="settlements-tours-v3-panel"
        onViewAll={() => navigate(state === "closed" ? "/driver-finance/settlements?tab=closed" : "/driver-finance/settlements?tab=open")}
        headerRight={
          <button type="button" data-testid="settlements-tours-columns-btn" className="ldt-btn" style={{ border: `1px solid ${V3.border}`, background: V3.surface, color: V3.ink, fontFamily: V3.font }}>⚙ Columns</button>
        }
      >
        {activeQ.isError ? (
          <div className="p-3">
            <ListErrorState status={0} message={activeQ.error instanceof Error ? activeQ.error.message : String(activeQ.error)} onRetry={() => void activeQ.refetch()} />
          </div>
        ) : (
          <ParityTable appearance="board"
            columns={TOUR_COLUMNS(state, companyId, filteredRows)}
            rows={filteredRows}
            rowKey={(r) => r.settlement_id}
            renderExpanded={(r) =>
              state === "open" ? (
                <TourPreSettlementTab settlementId={r.settlement_id} operatingCompanyId={companyId} />
              ) : (
                <TourSettlementTab settlementId={r.settlement_id} operatingCompanyId={companyId} />
              )
            }
            loading={activeQ.isLoading}
            emptyText={state === "open" ? "No open tours — a tour opens when a driver is assigned to a load." : "No closed tours yet — close a tour from the Pre-Settlement tab."}
            storageKey={`settlements-module-tours-${state}-v3`}
            exportFilename={`settlements-tours-${state}`}
            tableTestId={`settlements-tours-table-${state}`}
            suppressToolbarSearch
            enableColumnReorder
            enableColumnResize
            hidePager
            footerCells={{
              tour: (v: TourListRow[]) => <span className="font-semibold text-gray-600 text-section-header" data-testid="settlements-tour-totals-label">Totals ({formatQuantityTable(v.length, 0)})</span>,
              revenue: (v: TourListRow[]) => fmt(v.reduce((n, r) => n + r.revenue_cents, 0)),
              costs: (v: TourListRow[]) => fmt(v.reduce((n, r) => n + r.costs_cents, 0)),
              driver_pay: (v: TourListRow[]) => fmt(v.reduce((n, r) => n + r.driver_pay_cents, 0)),
              margin: (v: TourListRow[]) => fmt(v.reduce((n, r) => n + r.margin_cents, 0)),
            }}
          />
        )}
      </BoardSection>
      {state === "open" ? (
        <p className="text-xs text-[#6B7280]" data-testid="settlements-open-board-footnote">
          The Settlement column shows the P-number; click it to open the tour statement. Ready uses the engine
          readiness checklist for each row (ready_ok / ready_total — do not hard-code six). Canonical checks include
          all loads delivered · documents · miles locked · fuel attributed · advances matched · deductions confirmed,
          plus any additional hard blockers the tour readout reports. Waiting on = the one real reason, per row.
          Extra load columns and check counts stay in the table gear.
        </p>
      ) : (
        <p className="text-xs text-[#6B7280]" data-testid="settlements-closed-board-footnote">
          Settlement number and company settlement number both open their statements.
        </p>
      )}
    </div>
  );
}
