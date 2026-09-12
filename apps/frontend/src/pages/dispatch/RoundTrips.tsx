/** Linkage: mdata.loads · mdata.units · mdata.drivers · mdata.customers. Live=BLOCKED until Chrome on current healthz. */
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { DispatchLoadRow } from "../../api/loads";
import { listOpenPreSettlements } from "../../api/driverFinance";
import { listUnitsWithoutLoad, type UnitsWithoutLoad } from "../../api/dispatch";
import { listLoadInvoices } from "../../api/accounting";
import { flagDotColor, flagDotLabel, flagDotTag, hasVisibleFlag, STATUS_LABEL, formatMoneyCents, toRouteSummary } from "../../components/dispatch/constants";
import { DatePicker } from "../../components/forms/DatePicker";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import type { DataTableErrorState } from "../../lib/tableError";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { RT_KANBAN_CARD_CLASS, RT_KANBAN_COL_MIN, RT_PAIRING_ACTIVE_STATUSES, NEEDS_RETURN_STATUSES, orderedLegsForUnit, pairOutboundReturn, resolvedTripType } from "./roundTripsLegs";
import { RoundTripsTimeline, defaultTimelineRange } from "./RoundTripsTimeline";

const SORT_KEY = "ih35.roundTrips.sort";
const VIEW_KEY = "ih35.roundTrips.view";

const ACTIVE_STATUSES = new Set<string>(RT_PAIRING_ACTIVE_STATUSES);

// ROUND-20.2 (RT-FULL-TOUR) — a leg past this point has actually delivered; the billing chip only
// makes sense here (an active leg has no invoice yet by definition, and showing "not invoiced"
// next to a still-moving load would read as a defect that isn't one).
const DASHED_DIVIDER_CLASS = "border-l border-dashed border-[#C7D2DC]";

const DELIVERED_OR_BEYOND_STATUSES = new Set<string>([
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
]);

type UnitPair = {
  unitId: string;
  unitNumber: string | null;
  driverName: string | null;
  driverId: string | null;
  outbound: DispatchLoadRow | null;
  returnLoad: DispatchLoadRow | null;
  needsReturn: boolean;
  unitLoads: DispatchLoadRow[];
};

type SortMode = "truck" | "date" | "load";
type BoardView = "board" | "timeline";

type Props = {
  loads: DispatchLoadRow[];
  operatingCompanyId: string;
  loading: boolean;
  listError?: DataTableErrorState;
  onLoadClick: (loadId: string) => void;
  // RT-BOOK-RETURN (owner 2026-09-09): the "+ Book return" action must carry the truck (and its
  // driver) that needs the return so the booking prefills them — same as the Awaiting-assignment
  // card's per-truck "+ Book load". A no-arg callback forgot which unit, opening a blank booking.
  onBookReturn: (ctx: { unitId: string; driverId: string | null }) => void;
  /** BRD-10: the /dispatch/round-trips deep link should land on the timeline, not the load board. */
  deepLink?: boolean;
};

/** ROUND-20.2 — billing state beside the load number for a delivered-or-beyond leg. Live invoice
 * data (accounting.invoices via the existing GET /api/v1/loads/:id/invoices, WAVE-H2's own reverse
 * drill — no new backend endpoint needed). Never blank, never green without a real invoice number:
 * sent -> green "Invoiced <display_id>"; proforma -> amber "Pro forma <display_id>"; delivered with
 * no non-voided invoice at all -> amber "Delivered · not invoiced". An active (not-yet-delivered)
 * leg renders nothing here — it has no billing state to show yet. */
function BillingChip({ load, operatingCompanyId }: { load: DispatchLoadRow; operatingCompanyId: string }) {
  const isDeliveredOrBeyond = DELIVERED_OR_BEYOND_STATUSES.has(load.status);
  const invoicesQuery = useQuery({
    queryKey: ["round-trips", "load-invoices", load.id],
    queryFn: () => listLoadInvoices(operatingCompanyId, load.id, { limit: 10 }),
    enabled: isDeliveredOrBeyond,
    staleTime: 30_000,
  });

  if (!isDeliveredOrBeyond) return null;
  if (invoicesQuery.isLoading) {
    return (
      <span className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-400" data-testid="round-trip-billing-chip-loading">
        …
      </span>
    );
  }

  const invoices = (invoicesQuery.data?.invoices ?? []).filter((inv) => !inv.voided_at);
  const sent = invoices.find((inv) => inv.status === "sent");
  const proforma = invoices.find((inv) => inv.status === "proforma");

  if (sent) {
    return (
      <span className="rounded-sm bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-800" data-testid="round-trip-billing-chip-invoiced">
        Invoiced{" "}
        <EntityLink kind="invoice" id={sent.id} label={sent.display_id} className="underline" onClick={(e) => e.stopPropagation()} />
      </span>
    );
  }
  if (proforma) {
    return (
      <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800" data-testid="round-trip-billing-chip-proforma">
        Pro forma{" "}
        <EntityLink kind="invoice" id={proforma.id} label={proforma.display_id} className="underline" onClick={(e) => e.stopPropagation()} />
      </span>
    );
  }
  return (
    <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800" data-testid="round-trip-billing-chip-unbilled">
      Delivered · not invoiced
    </span>
  );
}

/** ROUND-20.2 — one bead per leg on a rail above a tour's cards: delivered = solid green with a
 * check, the leg running now = blue with a halo, everything else hollow. A tour with no SB booked
 * yet ends in a trailing hollow "SB not booked" bead. Rail fill = delivered legs / total beads. */
function TourRail({ legs, hasSb }: { legs: DispatchLoadRow[]; hasSb: boolean }) {
  const deliveredCount = legs.filter((leg) => DELIVERED_OR_BEYOND_STATUSES.has(leg.status)).length;
  const totalBeads = legs.length + (hasSb ? 0 : 1);
  const fillPct = totalBeads > 0 ? Math.round((deliveredCount / totalBeads) * 100) : 0;
  return (
    <div className="flex items-center gap-2" data-testid="round-trip-rail" data-rt-rail-fill={fillPct}>
      <div className="relative h-1 w-16 shrink-0 overflow-hidden rounded-full bg-gray-200">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#16A34A]" style={{ width: `${fillPct}%` }} />
      </div>
      <div className="flex items-center gap-1">
        {legs.map((leg) => {
          const delivered = DELIVERED_OR_BEYOND_STATUSES.has(leg.status);
          const running = ACTIVE_STATUSES.has(leg.status);
          return (
            <span
              key={leg.id}
              title={`${leg.load_number} · ${STATUS_LABEL[leg.status] ?? leg.status}`}
              data-testid={`round-trip-rail-bead-${leg.load_number}`}
              data-rt-bead-state={delivered ? "delivered" : running ? "running" : "pending"}
              className="inline-flex h-3 w-3 items-center justify-center rounded-full leading-none text-white"
              style={
                delivered
                  ? { backgroundColor: "#16A34A" }
                  : running
                    ? { backgroundColor: "#2a78d6", boxShadow: "0 0 0 3px rgba(42,120,214,0.28)" }
                    : { backgroundColor: "#fff", border: "1.5px solid #C7D2DC" }
              }
            >
              {delivered ? (
                <svg viewBox="0 0 12 12" width="7" height="7" aria-hidden="true">
                  <path d="M2.5 6.2l2.2 2.2 4.3-4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </span>
          );
        })}
        {!hasSb ? (
          <span
            title="SB not booked"
            data-testid="round-trip-rail-bead-sb-not-booked"
            className="inline-flex h-3 w-3 rounded-full border border-dashed border-gray-400 bg-white"
          />
        ) : null}
      </div>
    </div>
  );
}

/** ROUND-20.2 — card-header money: legs delivered, invoiced $ (sum of `sent`, non-voided invoice
 * totals across the tour's delivered legs — the SAME per-load query BillingChip already runs, same
 * queryKey, so react-query dedupes to one network call per load id, not a second fetch), and tour
 * revenue (sum of each leg's own booked rate_total_cents — already on the load row, no fetch). */
function TourHeaderMoney({
  legs,
  deliveredCount,
  operatingCompanyId,
}: {
  legs: DispatchLoadRow[];
  deliveredCount: number;
  operatingCompanyId: string;
}) {
  const deliveredLegs = useMemo(() => legs.filter((leg) => DELIVERED_OR_BEYOND_STATUSES.has(leg.status)), [legs]);
  const invoiceQueries = useQueries({
    queries: deliveredLegs.map((leg) => ({
      queryKey: ["round-trips", "load-invoices", leg.id],
      queryFn: () => listLoadInvoices(operatingCompanyId, leg.id, { limit: 10 }),
      staleTime: 30_000,
    })),
  });
  // ACCT-money-as-string: total_cents/rate_total_cents are NUMERIC columns and arrive as STRINGS
  // from node-postgres (same landmine as driving_hours_remaining/pos_lat elsewhere this session) --
  // `sum + value` string-concatenates instead of adding once any one operand is a string, silently
  // corrupting every total past the first leg. Number(...) each value before summing; formatMoneyCents
  // itself already does the same cast, which is why the per-card amount never showed this bug.
  const invoicedCents = invoiceQueries.reduce((sum, q) => {
    const invoices = (q.data?.invoices ?? []).filter((inv) => !inv.voided_at && inv.status === "sent");
    return sum + invoices.reduce((s, inv) => s + Number(inv.total_cents || 0), 0);
  }, 0);
  const tourRevenueCents = legs.reduce((sum, leg) => sum + Number(leg.rate_total_cents || 0), 0);
  const currencyCode = legs[0]?.currency_code ?? "USD";
  return (
    <span className="text-xs text-gray-500" data-testid="round-trip-header-money">
      {deliveredCount} of {legs.length} delivered · Invoiced {formatMoneyCents(invoicedCents, currencyCode)} · Tour{" "}
      {formatMoneyCents(tourRevenueCents, currencyCode)}
    </span>
  );
}

function TripCard({
  load,
  tag,
  operatingCompanyId,
  onClick,
}: {
  load: DispatchLoadRow;
  tag?: string;
  operatingCompanyId: string;
  onClick: (loadId: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(load.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(load.id);
      }}
      className={RT_KANBAN_CARD_CLASS}
      data-testid={`round-trip-load-${load.load_number}`}
    >
      <div className="flex items-center justify-between gap-2">
        <EntityLink kind="load" id={load.id} label={entityLabel(load.load_number, load.id, "Load")} className="font-semibold text-gray-900" onClick={(event) => event.stopPropagation()} />
        <div className="flex items-center gap-1">
          <BillingChip load={load} operatingCompanyId={operatingCompanyId} />
          {tag ? (
            <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{tag}</span>
          ) : null}
          {hasVisibleFlag(load.flag_code) ? (
            <span
              className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: flagDotColor(load.flag_code) }}
              title={flagDotLabel(load.flag_code)}
            >
              {flagDotTag(load.flag_code)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-1 text-xs text-gray-700">
        <EntityLinkOrTombstone
          kind="customer"
          id={load.customer_id}
          name={load.customer_name}
          noun="Customer"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="mt-1 text-[11px] text-gray-500">{toRouteSummary(load.first_pickup_city, load.first_delivery_city)}</div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-gray-600">
        <span>
          <EntityLinkOrTombstone
            kind="driver"
            id={load.assigned_primary_driver_id}
            name={load.assigned_primary_driver_name}
            noun="Driver"
            onClick={(e) => e.stopPropagation()}
          />
        </span>
        <span className="rounded-sm bg-gray-100 px-1.5 py-0.5">{STATUS_LABEL[load.status]}</span>
      </div>
      <div className="mt-1 text-xs font-semibold text-gray-800">
        {formatMoneyCents(load.rate_total_cents, load.currency_code)}
      </div>
    </div>
  );
}

function NeedsReturnCard({
  unitId,
  driverId,
  onBookReturn,
}: {
  unitId: string;
  driverId: string | null;
  onBookReturn: (ctx: { unitId: string; driverId: string | null }) => void;
}) {
  return (
    <div
      className="flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-slate-200 bg-slate-100/40 p-3 text-center"
      data-testid="round-trip-needs-return"
    >
      <span className="text-xs font-semibold text-slate-700">Needs return</span>
      <Button type="button" size="sm" variant="secondary" onClick={() => onBookReturn({ unitId, driverId })}>
        + Book return
      </Button>
    </div>
  );
}

function buildUnitPairs(
  loads: DispatchLoadRow[],
  preSettlements: Array<{
    settlement_id: string;
    driver_id: string;
    first_load_id: string | null;
    last_load_id: string | null;
  }>,
  idleUnits: UnitsWithoutLoad[]
): UnitPair[] {
  const loadById = new Map(loads.map((load) => [load.id, load]));
  const loadsByUnit = new Map<string, DispatchLoadRow[]>();

  // ROUND-20.2 (RT-FULL-TOUR) — owner ruling 2026-09-12: "Round Trips is the ONE exception [to
  // OPEN-ONLY] ... an OPEN tour renders whole, including its already-delivered legs. A CLOSED tour
  // never renders here at all." Resolve each open pre-settlement's unit the SAME way the idle-unit
  // pairing below already does (via its first_load_id's assigned_unit_id, falling back to
  // last_load_id) so a unit currently mid-tour keeps ALL its legs, not just the still-active one.
  const openSettlementIdByUnit = new Map<string, string>();
  for (const pre of preSettlements) {
    const anchor = (pre.first_load_id && loadById.get(pre.first_load_id)) || (pre.last_load_id && loadById.get(pre.last_load_id)) || null;
    const unitId = anchor?.assigned_unit_id;
    if (unitId) openSettlementIdByUnit.set(unitId, pre.settlement_id);
  }

  for (const load of loads) {
    const unitId = load.assigned_unit_id;
    if (!unitId) continue;
    const isActive = ACTIVE_STATUSES.has(load.status);
    // A terminal-status leg (delivered/invoiced/closed/...) is kept ONLY when it is linked to THIS
    // unit's still-open pre-settlement — never by status alone, never for a different unit's tour,
    // never once the tour itself has closed (openSettlementIdByUnit only holds OPEN settlements).
    const linkedToOpenTour =
      load.presettlement_link_id != null && load.presettlement_link_id === openSettlementIdByUnit.get(unitId);
    if (!isActive && !linkedToOpenTour) continue;
    loadsByUnit.set(unitId, [...(loadsByUnit.get(unitId) ?? []), load]);
  }

  const pairByUnit = new Map<string, UnitPair>();

  for (const [unitId, unitLoads] of loadsByUnit) {
    const { outbound, returnLoad } = pairOutboundReturn(unitLoads);
    const needsReturn = Boolean(outbound && !returnLoad && NEEDS_RETURN_STATUSES.has(outbound.status));

    pairByUnit.set(unitId, {
      unitId,
      unitNumber: outbound?.assigned_unit_number ?? unitLoads[0]?.assigned_unit_number ?? null,
      driverName: outbound?.assigned_primary_driver_name ?? unitLoads[0]?.assigned_primary_driver_name ?? null,
      driverId: outbound?.assigned_primary_driver_id ?? unitLoads[0]?.assigned_primary_driver_id ?? null,
      outbound,
      returnLoad,
      needsReturn,
      unitLoads,
    });
  }

  for (const unit of idleUnits) {
    if (!unit.last_drop_at || pairByUnit.has(unit.id)) continue;
    pairByUnit.set(unit.id, {
      unitId: unit.id,
      unitNumber: unit.unit_number,
      driverName: unit.driver_name,
      driverId: unit.driver_id ?? null,
      outbound: null,
      returnLoad: null,
      needsReturn: true,
      unitLoads: [],
    });
  }

  for (const pre of preSettlements) {
    if (!pre.first_load_id || (pre.last_load_id && pre.last_load_id !== pre.first_load_id)) continue;
    const outbound = loadById.get(pre.first_load_id);
    const unitId = outbound?.assigned_unit_id;
    if (!unitId || pairByUnit.has(unitId)) continue;
    pairByUnit.set(unitId, {
      unitId,
      unitNumber: outbound.assigned_unit_number ?? null,
      driverName: outbound.assigned_primary_driver_name ?? null,
      driverId: outbound.assigned_primary_driver_id ?? null,
      outbound,
      returnLoad: null,
      needsReturn: true,
      unitLoads: outbound ? [outbound] : [],
    });
  }

  return [...pairByUnit.values()];
}

function readSort(): SortMode {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SORT_KEY) : null;
  if (raw === "date" || raw === "load" || raw === "truck") return raw;
  return "truck";
}

function readView(_deepLink?: boolean): BoardView {
  // RT-FIX (lead 2026-09-06): the approved design (GO-RT-01 22a26613) opens on the LOAD BOARD (NB → TR → SB);
  // BRD-10 (ebc54d5d) flipped the deep link to the timeline — that is what the owner saw as "changed completely".
  // Default is the board again on every entry; the timeline stays one click away and remembers the choice.
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(VIEW_KEY) : null;
  if (raw === "timeline" || raw === "board") return raw;
  return "board";
}

export function RoundTrips({
  loads,
  operatingCompanyId,
  loading,
  listError,
  onLoadClick,
  onBookReturn,
  deepLink,
}: Props) {
  const enabled = Boolean(operatingCompanyId);
  const [sort, setSort] = useState<SortMode>(readSort);
  const [boardView, setBoardView] = useState<BoardView>(() => readView(deepLink));
  const [range, setRange] = useState(defaultTimelineRange);

  const preSettlementsQuery = useQuery({
    queryKey: ["dispatch", "round-trips", "pre-settlements", operatingCompanyId],
    queryFn: () => listOpenPreSettlements(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const idleUnitsQuery = useQuery({
    queryKey: ["dispatch", "round-trips", "units-without-load", operatingCompanyId],
    queryFn: () => listUnitsWithoutLoad(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const pairs = useMemo(() => {
    const built = buildUnitPairs(
      loads,
      preSettlementsQuery.data?.pre_settlements ?? [],
      idleUnitsQuery.data?.units ?? []
    );
    const copy = [...built];
    copy.sort((a, b) => {
      if (sort === "truck") return (a.unitNumber ?? "").localeCompare(b.unitNumber ?? "", undefined, { numeric: true });
      if (sort === "load") {
        const an = orderedLegsForUnit(a.unitLoads)[0]?.load_number ?? "";
        const bn = orderedLegsForUnit(b.unitLoads)[0]?.load_number ?? "";
        return an.localeCompare(bn, undefined, { numeric: true });
      }
      const at = Math.max(0, ...a.unitLoads.map((l) => Date.parse(l.created_at)));
      const bt = Math.max(0, ...b.unitLoads.map((l) => Date.parse(l.created_at)));
      return bt - at;
    });
    return copy;
  }, [idleUnitsQuery.data?.units, loads, preSettlementsQuery.data?.pre_settlements, sort]);

  if (listError) {
    return (
      <ListErrorState
        title="Round trips unavailable"
        status={listError.status}
        message={listError.message}
        onRetry={listError.onRetry}
      />
    );
  }

  if (!enabled) {
    return <div className="rounded-sm border bg-white p-4 text-xs text-slate-600">Select an operating company.</div>;
  }

  const isLoading = loading || preSettlementsQuery.isLoading || idleUnitsQuery.isLoading;
  const pairingReadFailed = preSettlementsQuery.isError || idleUnitsQuery.isError;

  const viewToggle = (
        <div className="inline-flex rounded-sm border border-gray-200">
          <button
            type="button"
            className={`px-2 py-0.5 ${boardView === "board" ? "bg-slate-800 text-white" : "bg-white text-slate-700"}`}
            data-testid="round-trips-view-board"
            onClick={() => {
              setBoardView("board");
              localStorage.setItem(VIEW_KEY, "board");
            }}
          >
            Load board
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 ${boardView === "timeline" ? "bg-slate-800 text-white" : "bg-white text-slate-700"}`}
            data-testid="round-trips-view-timeline"
            onClick={() => {
              setBoardView("timeline");
              localStorage.setItem(VIEW_KEY, "timeline");
            }}
          >
            Timeline
          </button>
        </div>
  );

  // Timeline paints assigned loads in the date window. Idle-unit / pre-settlement feed
  // failures must not hide it (REG-037: Aug-25→present units). Pairing board stays fail-closed.
  if (pairingReadFailed && boardView !== "timeline") {
    const failedFeeds = [
      preSettlementsQuery.isError ? "pre-settlement pairings" : null,
      idleUnitsQuery.isError ? "idle units" : null,
    ].filter(Boolean).join(" and ");
    return (
      <div className="space-y-2" data-testid="dispatch-round-trips-view">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          {viewToggle}
        </div>
        <ListErrorState
          title="Round-trip pairing unavailable"
          status={0}
          message={`Could not load ${failedFeeds}. Existing loads were not treated as an honest empty pairing.`}
          onRetry={() => {
            if (preSettlementsQuery.isError) void preSettlementsQuery.refetch();
            if (idleUnitsQuery.isError) void idleUnitsQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden space-y-2" data-testid="dispatch-round-trips-view">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span>Load board orders NB, then triangulation, then SB. TR sits between NB and SB.</span>
        <label className="ml-auto inline-flex items-center gap-1">
          Sort
          <select
            className="rounded-sm border border-gray-200 bg-white px-1 py-0.5"
            data-testid="round-trips-sort"
            value={sort}
            onChange={(e) => {
              const next = e.target.value as SortMode;
              setSort(next);
              localStorage.setItem(SORT_KEY, next);
            }}
          >
            <option value="truck">by truck</option>
            <option value="date">by date</option>
            <option value="load">by load</option>
          </select>
        </label>
        {viewToggle}
        {boardView === "timeline" ? (
          <span className="inline-flex items-center gap-1">
            <DatePicker
              data-testid="round-trips-range-from"
              value={range.from}
              onChange={(from) => setRange((r) => ({ ...r, from }))}
              className="w-36"
            />
            <DatePicker
              data-testid="round-trips-range-to"
              value={range.to}
              onChange={(to) => setRange((r) => ({ ...r, to }))}
              className="w-36"
            />
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-500">Loading round trips…</div>
      ) : boardView === "timeline" ? (
        <RoundTripsTimeline loads={loads} rangeFrom={range.from} rangeTo={range.to} onLoadClick={onLoadClick} />
      ) : pairs.length === 0 ? (
        <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-500">
          No open tours. A tour opens when a northbound load is booked from the yard.
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] space-y-3 pr-1" data-testid="round-trips-load-board">
          {pairs.map((pair) => {
            const legs = orderedLegsForUnit(pair.unitLoads);
            const chrono = [...pair.unitLoads].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
            const sequence = legs.map((load) => resolvedTripType(load, chrono.indexOf(load), chrono)).join("-");
            const cells = legs.length ? legs : [null];
            const hasSb = legs.some((load) => resolvedTripType(load, chrono.indexOf(load), chrono) === "SB");
            const deliveredCount = legs.filter((load) => DELIVERED_OR_BEYOND_STATUSES.has(load.status)).length;
            // ROUND-20.2 border-left law: the tour card stays the standing navy #14314F until every
            // leg has delivered AND an SB actually exists (a tour with only NB/TR delivered but no
            // SB booked yet is not "done" — it still needs its return leg before it can close).
            const tourComplete = legs.length > 0 && hasSb && deliveredCount === legs.length;
            return (
              <div
                key={pair.unitId}
                className="overflow-hidden rounded-[9px] bg-white"
                style={{ border: "1px solid #C7D2DC", borderLeft: `5px solid ${tourComplete ? "#16A34A" : "#14314F"}` }}
                data-testid={`round-trip-row-${pair.unitNumber ?? pair.unitId}`}
                data-rt-sequence={sequence || "empty"}
              >
                <div
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5"
                  style={{ background: "linear-gradient(180deg,#f6f9fc,#e9eff5)", borderBottom: "1px solid #C7D2DC" }}
                >
                  <div className="flex flex-wrap items-center gap-x-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                    <EntityLinkOrTombstone
                      kind="unit"
                      id={pair.unitId}
                      name={pair.unitNumber}
                      noun="Unit"
                      className="text-gray-600 hover:underline"
                      data-testid="round-trip-unit-link"
                      onClick={(e) => e.stopPropagation()}
                    />
                    {pair.driverId || pair.driverName ? (
                      <>
                        {" · "}
                        <EntityLinkOrTombstone
                          kind="driver"
                          id={pair.driverId ?? undefined}
                          name={pair.driverName}
                          noun="Driver"
                          className="text-gray-600 hover:underline"
                          data-testid="round-trip-driver-link"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </>
                    ) : null}
                    <span className="normal-case text-gray-400">·</span>
                    <span className="normal-case text-gray-500" data-testid="round-trip-tour-state">
                      {legs.length === 0
                        ? pair.needsReturn
                          ? "Needs return"
                          : "Open"
                        : tourComplete
                          ? "Tour delivered"
                          : "Tour Open"}
                    </span>
                  </div>
                  {legs.length > 0 ? <TourRail legs={legs} hasSb={hasSb} /> : null}
                  {legs.length > 0 ? (
                    <TourHeaderMoney legs={legs} deliveredCount={deliveredCount} operatingCompanyId={operatingCompanyId} />
                  ) : null}
                </div>
                <div className="flex min-w-max gap-0 p-2">
                  {cells.map((load, idx) => (
                    <div
                      key={load?.id ?? `empty-${idx}`}
                      className={`flex min-w-0 shrink-0 flex-col gap-1 px-2 first:pl-0 ${RT_KANBAN_COL_MIN.compact} ${idx > 0 ? DASHED_DIVIDER_CLASS : ""}`}
                    >
                      {load ? (
                        <TripCard
                          load={load}
                          operatingCompanyId={operatingCompanyId}
                          tag={
                            load.trip_type === "SB" || (!load.trip_type && pair.returnLoad?.id === load.id)
                              ? "RETURN·SB"
                              : load.trip_type === "TR"
                                ? "TR"
                                : "NB"
                          }
                          onClick={onLoadClick}
                        />
                      ) : pair.needsReturn ? (
                        <NeedsReturnCard unitId={pair.unitId} driverId={pair.driverId} onBookReturn={onBookReturn} />
                      ) : (
                        <div className="rounded-sm border border-dashed border-gray-300 bg-white px-3 py-6 text-center text-xs text-gray-500">
                          No active outbound load
                        </div>
                      )}
                    </div>
                  ))}
                  {/* REG-036 (owner 2026-09-10: "NB units have no Book-a-Return"): a unit that ALREADY has an
                      outbound leg (so cells rendered its NB/TR card, never the empty-cell NeedsReturnCard) but
                      still needs a southbound return gets its own trailing "+ Book return" slot next to the NB
                      card — the button was previously reachable only on units with zero legs. */}
                  {legs.length > 0 && pair.needsReturn && !pair.returnLoad ? (
                    <div className={`flex min-w-0 shrink-0 flex-col gap-1 px-2 ${RT_KANBAN_COL_MIN.compact} ${DASHED_DIVIDER_CLASS}`}><NeedsReturnCard unitId={pair.unitId} driverId={pair.driverId} onBookReturn={onBookReturn} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
