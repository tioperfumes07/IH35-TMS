// TABLE_DATE_OMIT: this table has no date column by design (not a time-series view).

import { useEffect, useState } from "react";
import { settlementNumber } from "../../lib/settlementNumber";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { formatDateUS } from "../../lib/formatDate";
import { closeTour, getTourReadout, listTours, type TourListRow } from "../../api/tourReadout";
import { userFacingApiError } from "../../lib/api-error-message";
import { useToast } from "../../components/Toast";
import { TourPreSettlementTab } from "../../components/dispatch/TourPreSettlementTab";
import { TourSettlementTab } from "../../components/dispatch/TourSettlementTab";
import { tourLoadColumns } from "../../components/dispatch/TourLegsCell";
import { formatUsdCents } from "../../lib/money";
import { formatDisplayName } from "../../components/v3/formatDisplayName";

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
  return r.is_open ? "—" : "No number";
};

/** ROUND 443.274-C — Ready = n/6 dots (board Settlements-Open Ready column). */
function ReadyDots({ ok, total }: { ok: number; total: number }) {
  const n = Math.max(0, total || 6);
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
const fmt = (c: number) => formatUsdCents(c);
const DASH = "\u2014";

/** Closed board: "No number" is red when a closed row still lacks AlwaysTrack (443.252 measured). */
/** Lead 443.278 (1): the ORIGINAL load's dates drill to that load. Its id is the live leg whose
 *  load_number is the origin; a cancelled origin (not a live leg) renders the date as plain text. */
function OriginDateCell({ row, date }: { row: TourListRow; date: string | null }) {
  if (!date) return <>{DASH}</>;
  const originId = row.origin_load_number ? row.legs.find((l) => l.load_number === row.origin_load_number)?.load_id ?? null : null;
  if (!originId) return <span title={row.origin_load_number ? `Load ${row.origin_load_number}` : undefined}>{formatDateUS(date)}</span>;
  return (
    <EntityLink
      kind="load"
      id={originId}
      label={formatDateUS(date)}
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

const TOUR_COLUMNS = (state: "open" | "closed", companyId: string, rows: readonly TourListRow[]): ParityColumn<TourListRow>[] => [
  { key: "tour", label: "Settlement", alwaysVisible: true, testId: "setl-tour-col-id", sortable: true, className: "whitespace-nowrap", minWidth: 90, sortValue: r => tourLabel(r), render: r => <SettlementCell row={r} /> },
  // COLUMN-ORDERING LAW (owner 2026-09-11): Load renders immediately next to Settlement, same as
  // every other surface this rule is applied to — before Driver/Unit, not after.
  ...tourLoadColumns("setl-tour-col", rows),
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
  // NEW-10 (owner 2026-09-07): "date started" + "delivery date" of the ORIGINAL load that created the
  // (re)settlement. Distinct from the tour-level "Started" (trip-open) stamp below — these are the
  // original load's own first-pickup / last-delivery stop dates, tooltip-tagged with its load number.
  // ROUND 443.254 N7 — PU date and DEL date as separate sortable columns (V3 Open/Closed).
  { key: "origin_started", label: "PU date", testId: "setl-tour-col-origin-started", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, headerTitle: "Pickup date of the ORIGINAL load that created this settlement", sortValue: r => r.origin_pickup_date ?? "", exportValue: r => (r.origin_pickup_date ? mmmDd(r.origin_pickup_date) : ""), render: r => <OriginDateCell row={r} date={r.origin_pickup_date} /> },
  { key: "origin_delivered", label: "DEL date", testId: "setl-tour-col-origin-delivered", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, headerTitle: "Delivery date of the ORIGINAL load that created this settlement", sortValue: r => r.origin_delivery_date ?? "", exportValue: r => (r.origin_delivery_date ? mmmDd(r.origin_delivery_date) : ""), render: r => <OriginDateCell row={r} date={r.origin_delivery_date} /> },
  { key: "started", label: "Date started", testId: "setl-tour-col-started", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, headerTitle: "When this tour/settlement opened (trip-start stamp) — see Date started for the original load's pickup", sortValue: r => r.trip_started_at ?? "", render: r => r.trip_started_at ? mmmDd(r.trip_started_at) : DASH },
  // ROUND 443.250 Closed board — column label "Ended" (was "Date ended").
  ...(state === "closed" ? [{ key: "closed", label: "Ended", testId: "setl-tour-col-closed", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, sortValue: (r: TourListRow) => r.trip_closed_at ?? "", render: (r: TourListRow) => r.trip_closed_at ? mmmDd(r.trip_closed_at) : DASH } as ParityColumn<TourListRow>] : []),
  { key: "revenue", label: "Revenue", testId: "setl-tour-col-revenue", sortable: true, cellClass: "whitespace-nowrap text-right tabular-nums", minWidth: 100, maxWidth: 140, sortValue: r => r.revenue_cents, render: r => fmt(r.revenue_cents) },
  { key: "costs", label: "Costs", testId: "setl-tour-col-costs", sortable: true, cellClass: "whitespace-nowrap text-right tabular-nums", minWidth: 100, maxWidth: 140, sortValue: r => r.costs_cents, render: r => fmt(r.costs_cents) },
  { key: "driver_pay", label: "Driver pay", testId: "setl-tour-col-driver-pay", sortable: true, cellClass: "whitespace-nowrap text-right tabular-nums", minWidth: 100, maxWidth: 140, sortValue: r => r.driver_pay_cents, render: r => fmt(r.driver_pay_cents) },
  // NEW-11 (owner 2026-09-07): margin $ and margin % were "combined awkwardly in one column"; split into
  // two clean, independently-sortable columns — money here, percentage in its own column below.
  { key: "margin", label: "Margin", testId: "setl-tour-col-margin", sortable: true, cellClass: "whitespace-nowrap text-right tabular-nums", minWidth: 100, maxWidth: 140, sortValue: r => r.margin_cents, render: r => <span className={r.margin_cents < 0 ? "text-[#991B1B]" : undefined}>{fmt(r.margin_cents)}</span> },
  { key: "margin_pct", label: "Margin %", testId: "setl-tour-col-margin-pct", sortable: true, cellClass: "whitespace-nowrap text-right tabular-nums", minWidth: 76, maxWidth: 100, sortValue: r => r.margin_pct ?? -Infinity, render: r => r.margin_pct == null ? DASH : <span className={r.margin_pct < 0 ? "text-[#991B1B]" : undefined}>{r.margin_pct.toFixed(1)}%</span> },
  { key: "miles_practical", label: "Practical mi", testId: "setl-tour-col-miles_practical", sortable: true, cellClass: "whitespace-nowrap tabular-nums", sortValue: r => r.miles_practical ?? -Infinity, render: r => r.miles_practical == null ? DASH : r.miles_practical.toLocaleString("en-US") },
  { key: "miles_real", label: "Real mi", testId: "setl-tour-col-miles_real", sortable: true, cellClass: "whitespace-nowrap tabular-nums", sortValue: r => r.miles_real ?? -Infinity, render: r => r.miles_real == null ? DASH : r.miles_real.toLocaleString("en-US") },
  ...(state === "open" ? [
    // ROUND 443.274-C board: Ready = n/6 dots; Waiting on = this row's first hard blocker.
    // Checks passed/required kept (Rule 07 — never delete) for export/gear; Ready + Waiting on are the board columns.
    { key: "ready_ok", label: "Checks passed", testId: "setl-tour-col-checks-passed", sortable: true, sortValue: (r: TourListRow) => r.ready_ok, render: (r: TourListRow) => r.ready_ok } as ParityColumn<TourListRow>,
    { key: "ready_total", label: "Checks required", testId: "setl-tour-col-checks-required", sortable: true, sortValue: (r: TourListRow) => r.ready_total, render: (r: TourListRow) => r.ready_total } as ParityColumn<TourListRow>,
    { key: "ready", label: "Ready", testId: "setl-tour-col-ready", sortable: true, minWidth: 100, maxWidth: 140, sortValue: (r: TourListRow) => r.ready_ok, render: (r: TourListRow) => <ReadyDots ok={r.ready_ok} total={r.ready_total || 6} /> } as ParityColumn<TourListRow>,
    { key: "close_blockers", label: "Waiting on", testId: "setl-tour-col-open-items", sortable: true, minWidth: 160, maxWidth: 280, sortValue: (r: TourListRow) => waitingOnReason(r), render: (r: TourListRow) => {
      const reason = waitingOnReason(r);
      return reason ? <span title={r.close_blockers.join("\n")} data-testid="setl-tour-first-blocker" className="block max-w-[260px] truncate text-left">{reason}</span> : DASH;
    } } as ParityColumn<TourListRow>,
    // SETL-POST — kept (Rule 07); board Open focuses Ready + Waiting on; Post stays for verify-and-post.
    { key: "post", label: "Post", testId: "setl-tour-col-post", minWidth: 120, maxWidth: 160, cellClass: "whitespace-nowrap", render: (r: TourListRow) => <PostTourAction row={r} companyId={companyId} /> } as ParityColumn<TourListRow>,
  ] : [
    // ROUND 443.274-C Closed board — Driver net bold; Company settlement links its statement.
    { key: "net", label: "Driver net", testId: "setl-tour-col-driver-net", sortable: true, cellClass: "whitespace-nowrap text-right tabular-nums font-bold", minWidth: 100, maxWidth: 140, sortValue: (r: TourListRow) => r.driver_net_cents ?? 0, render: (r: TourListRow) => r.driver_net_cents == null ? DASH : <span className="font-bold tabular-nums">{fmt(r.driver_net_cents)}</span> } as ParityColumn<TourListRow>,
    { key: "company", label: "Company settlement", testId: "setl-tour-col-company", minWidth: 120, maxWidth: 160, cellClass: "whitespace-nowrap", render: (r: TourListRow) => <CompanySettlementCell row={r} /> } as ParityColumn<TourListRow>,
  ]),
];

/**
 * SETL-POST — row-level "Verify & Post" for an OPEN pre-settlement. Gated on r.can_close (the same
 * hard-blocker verification the tour readout computes); on confirm it fetches the readout to name the
 * soft warnings the operator is confirming (owner law: confirm open items BY NAME), then calls the
 * existing close-tour endpoint (open→closed). No GL posts here — that is pay-run close on the detail
 * page. Nothing about the money math is new; this only surfaces the existing action on the list.
 */
function PostTourAction({ row, companyId }: { row: TourListRow; companyId: string }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const readoutQ = useQuery({
    queryKey: ["tour-readout", "settlement", companyId, row.settlement_id],
    queryFn: () => getTourReadout(row.settlement_id, companyId),
    enabled: confirming,
  });
  const post = useMutation({
    meta: { loads: true },
    mutationFn: () => closeTour(row.settlement_id, companyId),
    onSuccess: async () => {
      pushToast(`Pre-settlement ${tourLabel(row)} posted — settlement is now frozen`, "success");
      setConfirming(false);
      await qc.invalidateQueries({ queryKey: ["settlements-module", "tours"] });
      await qc.invalidateQueries({ queryKey: ["tour-readout"] });
      await qc.invalidateQueries({ queryKey: ["load-costs"] });
    },
    onError: (e) => pushToast(userFacingApiError(e, "Could not post the settlement."), "error"),
  });
  const soft = readoutQ.data?.soft_warnings ?? [];
  return (
    <>
      <button
        type="button"
        className={`ldt-btn ${row.can_close ? "p" : "g"}`}
        data-testid={`setl-tour-post-${row.settlement_id}`}
        disabled={!row.can_close || post.isPending}
        title={row.can_close ? "Verify the checklist, then post this pre-settlement into a settlement" : row.close_blockers.join(" \u00b7 ")}
        onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
      >
        Verify &amp; Post
      </button>
      {confirming ? (
        <div className="ldt-modal-backdrop" onClick={(e) => { e.stopPropagation(); setConfirming(false); }} data-testid="setl-tour-post-confirm">
          <div className="ldt-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="ldt-modal-head"><span className="ldt-modal-title">Post {tourLabel(row)} → Settlement</span><button type="button" className="ldt-btn g" onClick={() => setConfirming(false)} aria-label="Close">×</button></div>
            <div className="ldt-modal-body">
              <p>This posts the pre-settlement for <b>{row.driver_name ?? "the driver"}</b> into a settlement: earnings and escrow lines are written and the company settlement for the period closes alongside. Nothing posts to the general ledger here — posting happens at pay-run close.</p>
              {readoutQ.isLoading ? <div className="ldt-note">Checking open items…</div>
                : soft.length ? <div className="ldt-note warn"><b>You are confirming these open items by name:</b><ul style={{ margin: "6px 0 0 16px" }}>{soft.map((w) => <li key={w}>{w}</li>)}</ul></div>
                : <div className="ldt-note">Every readiness item is satisfied.</div>}
              <div className="ldt-actions">
                <button type="button" className="ldt-btn p" data-testid="setl-tour-post-confirm-button" disabled={post.isPending || readoutQ.isLoading} onClick={() => post.mutate()}>{post.isPending ? "Posting\u2026" : "Post settlement"}</button>
                <button type="button" className="ldt-btn g" onClick={() => setConfirming(false)}>Not yet</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function SettlementsToursRegister({ companyId }: { companyId: string }) {
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
  const openQ = useQuery({ queryKey: ["settlements-module", "tours", "open", companyId], queryFn: () => listTours(companyId, "open"), enabled: Boolean(companyId) });
  const closedQ = useQuery({ queryKey: ["settlements-module", "tours", "closed", companyId], queryFn: () => listTours(companyId, "closed"), enabled: Boolean(companyId) });
  const activeQ = state === "open" ? openQ : closedQ;
  const rows = activeQ.data?.rows ?? [];
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [closedCount, setClosedCount] = useState<number | null>(null);
  useEffect(() => { if (openQ.data) setOpenCount(openQ.data.count); }, [openQ.data]);
  useEffect(() => { if (closedQ.data) setClosedCount(closedQ.data.count); }, [closedQ.data]);

  // ROUND 443.250 / 443.326 — Open / Closed boards share Settlements home KPIs; this register is
  // the board delta (section title + Pre-Settlement (Open) / Settlement (Closed) pills). Engines
  // unchanged (listTours open|closed). Keep .ldt-btn pills (verify-settlements-list-button-height-uniform).
  // Panel unwrap — ParityTable is the board surface.
  const panelTitle = state === "closed" ? "Closed settlements" : "Open tours · pre-settlements";
  const panelSubtitle =
    typeof activeQ.data?.voided_count === "number"
      ? `${rows.length} live · ${activeQ.data.voided_count} voided/cancelled (not shown)`
      : undefined;

  return (
    <div
      className="space-y-2"
      data-testid="settlements-tours-view"
      data-surface="load-detail"
      data-settlements-tours-v3="1"
    >
      <div className="flex flex-wrap items-center gap-1" data-testid="settlements-tours-pills">
        {(["open", "closed"] as const).map(s => (
          <button
            key={s}
            type="button"
            data-testid={`settlements-tours-pill-${s}`}
            aria-pressed={state === s}
            onClick={() => setState(s)}
            className={`ldt-btn ${state === s ? "p" : "g"}`}
          >
            {s === "open" ? "Pre-Settlement (Open)" : "Settlement (Closed)"}
            <span className={`ml-1 inline-flex min-w-[16px] items-center justify-center rounded-sm px-1 text-section-header ${state === s ? "bg-white/20 text-white" : "bg-gray-100 text-[#6B7280]"}`}>
              {(s === "open" ? openCount : closedCount) ?? "\u2014"}
            </span>
          </button>
        ))}
      </div>
      {/* R-102-B item 5 ("DEFAULT FILTERS" — owner, ROUND 121: "a list that silently hides is the
          same class of defect as a badge that never renders"). This register permanently excludes
          cancelled/reversed/voided settlements (SETL-REVERSED-HIDE, an owner ruling this PR does
          not change) with no toggle to see them — the honest disclosure this ruling still owes. */}
      <div data-testid="settlements-tours-v3-panel">
        <div className="mb-2">
          <h2 className="text-section-header font-bold uppercase tracking-[0.4px] text-[#4B5563]">
            {panelTitle}
          </h2>
          {panelSubtitle ? (
            <p className="text-xs text-gray-500" data-testid="settlements-tours-voided-count">
              {panelSubtitle}
            </p>
          ) : null}
        </div>
        {activeQ.isError ? (
          <div className="p-3">
            <ListErrorState status={0} message={activeQ.error instanceof Error ? activeQ.error.message : String(activeQ.error)} onRetry={() => void activeQ.refetch()} />
          </div>
        ) : (
          <ParityTable
            columns={TOUR_COLUMNS(state, companyId, rows)}
            rows={rows}
            rowKey={r => r.settlement_id}
            loading={activeQ.isLoading}
            emptyText={state === "open" ? "No open tours — a tour opens when a driver is assigned to a load." : "No closed tours yet — close a tour from the Pre-Settlement tab."}
            storageKey={`settlements-module-tours-${state}-v3`}
            exportFilename={`settlements-tours-${state}`}
            tableTestId={`settlements-tours-table-${state}`}
            enableColumnReorder
            enableColumnResize
            expandMode="single"
            renderExpanded={r => (
              <div className="p-3" data-testid={`settlements-tour-expand-${state}`}>
                {state === "open"
                  ? <TourPreSettlementTab settlementId={r.settlement_id} operatingCompanyId={companyId} />
                  : <TourSettlementTab settlementId={r.settlement_id} operatingCompanyId={companyId} />}
              </div>
            )}
            footerCells={{
              tour: (v: TourListRow[]) => <span className="font-semibold uppercase tracking-[0.4px] text-gray-600 text-section-header" data-testid="settlements-tour-totals-label">Totals ({v.length})</span>,
              revenue: (v: TourListRow[]) => fmt(v.reduce((n, r) => n + r.revenue_cents, 0)),
              costs: (v: TourListRow[]) => fmt(v.reduce((n, r) => n + r.costs_cents, 0)),
              driver_pay: (v: TourListRow[]) => fmt(v.reduce((n, r) => n + r.driver_pay_cents, 0)),
              margin: (v: TourListRow[]) => fmt(v.reduce((n, r) => n + r.margin_cents, 0)),
            }}
          />
        )}
      </div>
      {state === "open" ? (
        <p className="text-xs text-[#6B7280]" data-testid="settlements-open-board-footnote">
          The Settlement column shows the P-number; click it to open the tour statement. Ready = 6 checks
          (all loads delivered · documents · miles locked · fuel attributed · advances matched · deductions
          confirmed). Waiting on = the one real reason, per row.
        </p>
      ) : (
        <p className="text-xs text-[#6B7280]" data-testid="settlements-closed-board-footnote">
          Settlement number and company settlement number both open their statements.
        </p>
      )}
    </div>
  );
}
