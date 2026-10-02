import { useMemo, type ReactNode } from "react";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import {
  getDetentionBoard,
  getDispatchDashboard,
  listAtRiskOrLateDispatchLoads,
  listAllDispatchLoads,
  listDispatchLoads,
  listUnitsWithoutLoad,
  type DispatchAlertLoadRow,
  type DetentionBoardEvent,
  type DispatchLoad,
  type UnitsWithoutLoad,
} from "../../api/dispatch";
import { listLoadsNeedingDriverBillRemint } from "../../api/loads";
import { DispatchLoadCostsPanel } from "../../components/dispatch/DispatchLoadCostsPanel";
import "../../design/ih35-design-tokens.css";
import "./dispatch-board.css";
import { addDaysIso, companyToday } from "../../lib/businessDate";

type Props = {
  operatingCompanyId: string;
  onLoadClick?: (loadId: string) => void;
};

type BorderCrossingEvent = {
  uuid: string;
  vehicle_id: string;
  unit_id: string | null;
  unit_number: string | null;
  driver_uuid: string | null;
  driver_name: string | null;
  load_uuid: string | null;
  load_number: string | null;
  crossing_point: string;
  direction: string;
  entered_geofence_at: string;
};

const PANEL_ROW_LIMIT = 6;

// TRUCKLINE-16 (Lead, 2026-09-30): "Active loads" / "on_load" now reads the canonical DISPATCH WORK
// predicate (apps/backend/src/dispatch/canonical-active-load-set.ts's DISPATCH_WORK_LOAD_STATUSES)
// — the same set Truck Line, List, Kanban and Trip Pairing all use, so every surface agrees. The
// drill URL carries the identical set so the tile and its table agree. completed_docs_received (and
// everything at-or-past delivery) is DELIBERATELY excluded — paperwork-done means the truck is no
// longer carrying the load; a delivered load belongs to the factoring/billing pipeline, surfaced by
// its own "Delivered — pending docs" tile drilling to /dispatch/factoring-queue. Frontend cannot
// import the backend module directly — keep this list textually identical to
// DISPATCH_WORK_LOAD_STATUSES if that ever changes.
const ACTIVE_LOAD_DRILL_STATUSES = [
  "booked",
  "planned",
  "assigned",
  "unassigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
] as const;
const ACTIVE_LOAD_DRILL_HREF = `/dispatch/loads?statuses=${ACTIVE_LOAD_DRILL_STATUSES.join(",")}`;
// Delivered-but-not-closed loads: awaiting docs / factoring purchase. Drills into the factoring queue.
const DELIVERED_DRILL_HREF = "/dispatch/factoring-queue";

const CROSSING_LABELS: Record<string, string> = {
  "laredo-i": "Laredo I",
  "laredo-ii": "Laredo II",
  "laredo-iii": "World Trade",
  "laredo-iv": "Colombia",
  colombia: "Colombia",
  other: "Other",
};

// OWNER DESIGN LAW 2026-10-02 (docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md): the app is built identical to
// the boards. KPI blocks are tiles ACROSS at 78px with a left-aligned 21px figure (rule 6, supersedes the 2026-09-04
// "centered" ruling); every panel is a real table with lines for rows, never columns (rule 1); missing renders as "—"
// (rules 7, 13); a correct empty screen says so (rule 14). Tile value = the drill table's row count.
function KpiCard({
  label,
  value,
  hint,
  to,
  disabled,
  disabledReason,
}: {
  label: string;
  value: number | string;
  hint?: string;
  to?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const testId = `dispatch-overview-kpi-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const body = (
    <>
      <div className="ih-hd">{label}</div>
      <div className="ih-kpi__value">{value}</div>
      {hint ? <div className="dpo-kpi-hint" title={hint}>{hint}</div> : null}
    </>
  );
  if (disabled) {
    return (
      <div className="ih-kpi dpo-kpi" data-testid={testId} aria-disabled="true" title={disabledReason} data-kpi-disabled="true">
        {body}
      </div>
    );
  }
  if (to) {
    return (
      <Link to={to} className="ih-kpi dpo-kpi" data-testid={testId}>
        {body}
      </Link>
    );
  }
  return (
    <div className="ih-kpi dpo-kpi" data-testid={testId}>
      {body}
    </div>
  );
}

const DASH = <span className="ih-empty">—</span>;

type PanelState = { isLoading: boolean; isError: boolean; refetch: () => unknown };
type PanelColumn = { label: string; num?: boolean };
type PanelRowData = { key: string; cells: ReactNode[]; onOpen?: () => void };

/** One overview panel = one card holding one table: header row of column labels, one line per row. */
function OverviewTable({
  title,
  hint,
  viewAllHref,
  columns,
  query,
  errorMessage,
  emptyMessage,
  rows,
}: {
  title: string;
  hint?: string;
  viewAllHref?: string;
  columns: PanelColumn[];
  query: PanelState;
  errorMessage: string;
  emptyMessage: string;
  rows: PanelRowData[];
}) {
  const withOpen = rows.some((r) => r.onOpen);
  return (
    <section className="ih-card dpo-card">
      <div className="ih-card-header dpo-card-head">
        <div>
          <div className="dpo-card-title">{title}</div>
          {hint ? <div className="dpo-card-sub">{hint}</div> : null}
        </div>
        {viewAllHref ? <Link to={viewAllHref} className="dpo-link">View all →</Link> : null}
      </div>
      {query.isLoading ? (
        <div className="dpo-state">Loading…</div>
      ) : query.isError ? (
        // DISPATCH-OVERVIEW-PANEL-ISERROR-SWALLOWED: a failed fetch is never shown as an all-clear empty panel.
        <div className="dpo-state dpo-state--error">
          {errorMessage}{" "}
          <button type="button" className="dpo-retry" onClick={() => void query.refetch()}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="dpo-state">{emptyMessage}</div>
      ) : (
        <table className="ih-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label} className={c.num ? "ih-hd ih-num" : "ih-hd"}>{c.label}</th>
              ))}
              {withOpen ? <th className="ih-hd" aria-label="Open" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                {r.cells.map((cell, i) => (
                  <td key={i} className={columns[i]?.num ? "ih-num" : undefined}>{cell ?? DASH}</td>
                ))}
                {withOpen ? (
                  <td>{r.onOpen ? <button type="button" className="dpo-open" onClick={r.onOpen}>open →</button> : null}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Real Load reference for a unit's last delivery, or an honest "—" when the unit has never
 * delivered one (a brand-new/leased-in truck). REG-038: replaces the placeholder strings
 * "Return load not booked" / "Need load" that told the dispatcher nothing concrete to click. */
function LastLoadCell({ unit }: { unit: UnitsWithoutLoad }) {
  if (!unit.last_delivered_load_id) return DASH;
  return (
    <EntityLinkOrTombstone
      kind="load"
      id={unit.last_delivered_load_id}
      name={unit.last_delivered_load_number}
      noun="Load"
    />
  );
}

/** Whole days since a unit's last delivery — "—" when the backend has no delivery time (never a fake 0d). */
function daysIdle(unit: UnitsWithoutLoad): ReactNode {
  return unit.hours_since_last_delivery == null ? DASH : `${Math.floor(unit.hours_since_last_delivery / 24)}d`;
}

export function DispatchOverview({ operatingCompanyId, onLoadClick }: Props) {
  const today = companyToday();
  const weekAgo = addDaysIso(today, -7);
  const enabled = Boolean(operatingCompanyId);

  const dashboardQ = useQuery({
    queryKey: ["dispatch", "overview", "dashboard", operatingCompanyId],
    queryFn: () => getDispatchDashboard(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const atRiskLateQ = useQuery({
    queryKey: ["dispatch", "overview", "at-risk-or-late", operatingCompanyId],
    queryFn: () => listAtRiskOrLateDispatchLoads(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const unitsWithoutLoadQ = useQuery({
    queryKey: ["dispatch", "overview", "units-without-load", operatingCompanyId],
    queryFn: () => listUnitsWithoutLoad(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  // ACCT-F10164 REMINT SCREEN — LAW-FIX-INSTANTLY item 8, bills never auto-created.
  const needsDriverBillRemintQ = useQuery({
    queryKey: ["dispatch", "overview", "needs-driver-bill-remint", operatingCompanyId],
    queryFn: () => listLoadsNeedingDriverBillRemint(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const exposureLoadsQ = useQuery({
    queryKey: ["dispatch", "overview", "round-trip-exposure", operatingCompanyId],
    queryFn: () =>
      listDispatchLoads({
        operating_company_id: operatingCompanyId,
        view: "home",
        // REG-038: "Round-trip exposure" becomes a top-level KPI tile below, and this file's own law
        // is "tile value must equal the drill table row count" -- the panel can no longer slice to
        // PANEL_ROW_LIMIT, so the query itself must not silently cap a real fleet below its true
        // count either. 20 was sized for a "top few" preview; 200 comfortably exceeds any fleet size
        // this entity operates while still being a real bound, not "unlimited".
        limit: 200,
        offset: 0,
        status: ["dispatched", "in_transit"],
      }),
    enabled,
    refetchInterval: 60_000,
  });

  const oosLoadsQ = useQuery({
    queryKey: ["dispatch", "overview", "oos-loads", operatingCompanyId],
    queryFn: () =>
      listAllDispatchLoads({
        operating_company_id: operatingCompanyId,
        view: "home",
        status: ["assigned_not_dispatched", "dispatched", "in_transit", "delivered_pending_docs"],
      }),
    enabled,
    refetchInterval: 60_000,
  });

  const detentionQ = useQuery({
    queryKey: ["dispatch", "overview", "detention", operatingCompanyId],
    queryFn: () => getDetentionBoard(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const borderQ = useQuery({
    queryKey: ["dispatch", "overview", "border-crossings", operatingCompanyId, weekAgo, today],
    queryFn: () =>
      apiRequest<{ data: BorderCrossingEvent[] }>(
        `/api/v1/dispatch/border-crossings/history?operating_company_id=${encodeURIComponent(operatingCompanyId)}&from=${weekAgo}&to=${today}`
      ),
    enabled,
    refetchInterval: 60_000,
  });

  const unitsWithoutLoad = unitsWithoutLoadQ.data?.units ?? [];
  const unitsAvailable = unitsWithoutLoad.length;
  const unitsNeedingReturn = useMemo(
    () => unitsWithoutLoad.filter((unit) => unit.last_drop_at != null).length,
    [unitsWithoutLoad]
  );
  const returnUnits = useMemo(
    () => unitsWithoutLoad.filter((unit) => unit.last_drop_at != null),
    [unitsWithoutLoad]
  );
  // REG-038: "Days since last delivery" -- worst-case (longest-idle) unit is the single headline
  // number a dispatcher acts on; the full sorted breakdown (every idle unit, not a top-N slice --
  // same "no separate list page" law as the panels above) lives in its own drill panel below.
  const sortedByDaysIdle = useMemo(
    () => [...returnUnits].sort((a, b) => (b.hours_since_last_delivery ?? 0) - (a.hours_since_last_delivery ?? 0)),
    [returnUnits]
  );
  // Unknown hours sort last; the headline is null (renders "—") unless some unit has a real delivery time.
  const worstIdleHours = sortedByDaysIdle[0]?.hours_since_last_delivery;
  const maxDaysIdle = worstIdleHours == null ? null : Math.floor(worstIdleHours / 24);


  const atRiskLateTotal = atRiskLateQ.data?.count ?? 0;

  const oosLoads = useMemo(
    () => (oosLoadsQ.data?.loads ?? []).filter((load) => load.is_dispatch_blocked),
    [oosLoadsQ.data?.loads]
  );

  const exposureLoads = exposureLoadsQ.data?.loads ?? [];
  const atRiskLoads = atRiskLateQ.data?.loads ?? [];
  const detentionEvents = detentionQ.data?.events ?? [];
  const borderEvents = borderQ.data?.data ?? [];

  if (!enabled) {
    return (
      <div className="dpo" data-testid="dispatch-overview-page">
        <div className="dpo-state">Select an operating company.</div>
      </div>
    );
  }

  const openLoad = (loadId: string | null | undefined) => (loadId && onLoadClick ? () => onLoadClick(loadId) : undefined);
  const UNIT_DRIVER_LOAD: PanelColumn[] = [{ label: "Unit" }, { label: "Driver" }, { label: "Load" }];

  return (
    <div className="dpo" data-testid="dispatch-overview-page">
      <section>
        <div className="dpo-kpis">
          <KpiCard
            label="Active loads"
            value={dashboardQ.isLoading || dashboardQ.isError ? "—" : (dashboardQ.data?.on_load ?? 0)}
            hint={dashboardQ.data ? `${dashboardQ.data.in_transit} in transit · trucks with a load out` : undefined}
            to={ACTIVE_LOAD_DRILL_HREF}
          />
          <KpiCard
            label="Delivered — pending docs"
            value={dashboardQ.isLoading || dashboardQ.isError ? "—" : (dashboardQ.data?.delivered ?? 0)}
            hint="delivered — factoring / billing queue"
            to={DELIVERED_DRILL_HREF}
          />
          <KpiCard
            label="At-risk / late"
            value={atRiskLateQ.isLoading || atRiskLateQ.isError ? "—" : atRiskLateTotal}
            hint="each load once; detention is its own tile"
            to="/dispatch/at-risk"
          />
          <KpiCard
            label="Detention"
            value={detentionQ.isLoading || detentionQ.isError ? "—" : (detentionQ.data?.count ?? 0)}
            hint={detentionQ.data ? `${detentionQ.data.active_count} actively accruing` : undefined}
            to="/dispatch/detention"
          />
          <KpiCard
            label="Units available"
            value={unitsWithoutLoadQ.isLoading || unitsWithoutLoadQ.isError ? "—" : unitsAvailable}
            hint="idle, no active load"
            to="/dispatch#unassigned-units"
          />
          <KpiCard
            label="Units needing return"
            value={unitsWithoutLoadQ.isLoading || unitsWithoutLoadQ.isError ? "—" : unitsNeedingReturn}
            hint="recent drop, no return booked"
            to="/dispatch#units-needing-return"
          />
          <KpiCard
            label="Round-trip exposure"
            value={exposureLoadsQ.isLoading || exposureLoadsQ.isError ? "—" : exposureLoads.length}
            hint="out on the road, no return leg confirmed"
            to="/dispatch#round-trip-exposure"
          />
          <KpiCard
            label="Days since last delivery"
            value={unitsWithoutLoadQ.isLoading || unitsWithoutLoadQ.isError ? "—" : maxDaysIdle == null ? "—" : `${maxDaysIdle}d`}
            hint={maxDaysIdle == null ? "no idle unit with a delivery" : "longest idle unit, no return booked"}
            to="/dispatch#days-since-last-delivery"
          />
        </div>
      </section>

      {dashboardQ.isError ? (
        <div className="dpo-state dpo-state--error" data-testid="dispatch-overview-dashboard-error">
          {"Couldn't load the Dispatch overview totals."}{" "}
          <button type="button" className="dpo-retry" onClick={() => void dashboardQ.refetch()}>Retry</button>
        </div>
      ) : null}

      <DispatchLoadCostsPanel operatingCompanyId={operatingCompanyId} />

      {/* Tile-value law: each tile above drills to the panel below that renders EVERY row it counted (no slice). */}
      <div className="dpo-grid">
        <div id="units-needing-return" data-testid="dispatch-units-needing-return-panel">
          <OverviewTable
            title="Units needing return"
            columns={UNIT_DRIVER_LOAD}
            query={unitsWithoutLoadQ}
            errorMessage="Couldn't load units needing return."
            emptyMessage="No delivered units are waiting for a return load."
            rows={returnUnits.map((unit) => ({
              key: unit.id,
              cells: [
                <EntityLinkOrTombstone kind="unit" id={unit.id} name={unit.unit_number} noun="Unit" />,
                <EntityLinkOrTombstone kind="driver" id={unit.driver_id} name={unit.driver_name} noun="Driver" />,
                <LastLoadCell unit={unit} />,
              ],
            }))}
          />
        </div>
        <div id="unassigned-units" data-testid="dispatch-unassigned-units-panel">
          <OverviewTable
            title="Unassigned units" viewAllHref="/dispatch?view=list"
            columns={UNIT_DRIVER_LOAD}
            query={unitsWithoutLoadQ}
            errorMessage="Couldn't load unassigned units."
            emptyMessage="All units currently have active loads."
            rows={unitsWithoutLoad.map((unit: UnitsWithoutLoad) => ({
              key: unit.id,
              cells: [
                <EntityLinkOrTombstone kind="unit" id={unit.id} name={unit.unit_number} noun="Unit" />,
                <EntityLinkOrTombstone kind="driver" id={unit.driver_id} name={unit.driver_name} noun="Driver" />,
                <LastLoadCell unit={unit} />,
              ],
            }))}
          />
        </div>
        <div id="days-since-last-delivery" data-testid="dispatch-days-since-last-delivery-panel">
          <OverviewTable
            title="Days since last delivery"
            hint="Idle units, longest since their last confirmed delivery first."
            columns={[...UNIT_DRIVER_LOAD, { label: "Days idle", num: true }]}
            query={unitsWithoutLoadQ}
            errorMessage="Couldn't load days since last delivery."
            emptyMessage="No idle units — every unit either has a load or has never delivered one yet."
            rows={sortedByDaysIdle.map((unit) => ({
              key: unit.id,
              cells: [
                <EntityLinkOrTombstone kind="unit" id={unit.id} name={unit.unit_number} noun="Unit" />,
                <EntityLinkOrTombstone kind="driver" id={unit.driver_id} name={unit.driver_name} noun="Driver" />,
                <LastLoadCell unit={unit} />,
                daysIdle(unit),
              ],
            }))}
          />
        </div>
        <div id="round-trip-exposure" data-testid="dispatch-round-trip-exposure-panel">
          <OverviewTable
            title="Round-trip exposure" viewAllHref="/dispatch?view=list"
            hint="Dispatched or in transit, no return leg confirmed complete yet."
            columns={[...UNIT_DRIVER_LOAD, { label: "Customer" }]}
            query={exposureLoadsQ}
            errorMessage="Couldn't load round-trip exposure."
            emptyMessage="No in-transit or dispatched loads."
            rows={exposureLoads.map((load: DispatchLoad) => ({
              key: load.id,
              cells: [
                <EntityLinkOrTombstone kind="unit" id={load.assigned_unit_id} name={load.unit_number} noun="Unit" />,
                <EntityLinkOrTombstone kind="driver" id={load.assigned_primary_driver_id} name={load.driver_short_name} noun="Driver" />,
                <EntityLink kind="load" id={load.id} label={entityLabel(load.load_number, load.id, "Load")} />,
                <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" />,
              ],
              onOpen: openLoad(load.id),
            }))}
          />
        </div>
        <OverviewTable
          title="At-risk / late loads"
          viewAllHref="/dispatch/at-risk"
          columns={[...UNIT_DRIVER_LOAD, { label: "Customer" }]}
          query={atRiskLateQ}
          errorMessage="Couldn't load at-risk or late loads."
          emptyMessage="No at-risk or late loads right now."
          rows={atRiskLoads.slice(0, PANEL_ROW_LIMIT).map((load: DispatchAlertLoadRow) => ({
            key: load.id,
            cells: [
              <EntityLinkOrTombstone kind="unit" id={load.unit_id} name={load.unit_number} noun="Unit" />,
              <EntityLinkOrTombstone kind="driver" id={load.driver_id} name={load.driver_name} noun="Driver" />,
              <EntityLink kind="load" id={load.id} label={entityLabel(load.load_number, load.id, "Load")} />,
              <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" />,
            ],
            onOpen: openLoad(load.id),
          }))}
        />
        <OverviewTable
          title="Missing driver bill"
          viewAllHref="/dispatch/driver-bill-remint"
          columns={[{ label: "Load" }, { label: "Driver" }, { label: "Status" }]}
          query={needsDriverBillRemintQ}
          errorMessage="Couldn't load the driver-bill remint queue."
          emptyMessage="Every delivered load has a driver bill."
          rows={(needsDriverBillRemintQ.data?.loads ?? [])
            .filter((load) => !load.is_sample_data)
            .slice(0, PANEL_ROW_LIMIT)
            .map((load) => ({
              key: load.id,
              cells: [
                <EntityLinkOrTombstone kind="load" id={load.id} name={load.load_number} noun="Load" />,
                <EntityLinkOrTombstone kind="driver" id={load.driver_id} name={load.driver_name} noun="Driver" />,
                load.status.replace(/_/g, " "),
              ],
            }))}
        />
        <OverviewTable
          title="Detention board"
          viewAllHref="/dispatch/detention"
          columns={[...UNIT_DRIVER_LOAD, { label: "Customer" }]}
          query={detentionQ}
          errorMessage="Couldn't load detention board."
          emptyMessage="No active detention events."
          rows={detentionEvents.slice(0, PANEL_ROW_LIMIT).map((event: DetentionBoardEvent) => ({
            key: event.id,
            cells: [
              <EntityLinkOrTombstone kind="unit" id={event.unit_id} name={event.unit_number} noun="Unit" />,
              <EntityLinkOrTombstone kind="driver" id={event.driver_id} name={event.driver_name} noun="Driver" />,
              <EntityLink kind="load" id={event.load_id} label={entityLabel(event.load_number, event.load_id, "Load")} />,
              <EntityLinkOrTombstone kind="customer" id={event.customer_id} name={event.customer_name} noun="Customer" />,
            ],
            onOpen: openLoad(event.load_id),
          }))}
        />
        <OverviewTable
          title="Border crossings"
          hint="Last 7 days."
          viewAllHref="/dispatch/border-crossing"
          columns={[...UNIT_DRIVER_LOAD, { label: "Crossing" }]}
          query={borderQ}
          errorMessage="Couldn't load border crossings."
          emptyMessage="No border crossings in the last 7 days."
          rows={borderEvents.slice(0, PANEL_ROW_LIMIT).map((event) => ({
            key: event.uuid,
            cells: [
              event.unit_id
                ? <EntityLinkOrTombstone kind="unit" id={event.unit_id} name={event.unit_number} noun="Unit" />
                : event.vehicle_id || "Unassigned",
              <EntityLinkOrTombstone kind="driver" id={event.driver_uuid} name={event.driver_name} noun="Driver" />,
              event.load_uuid ? <EntityLinkOrTombstone kind="load" id={event.load_uuid} name={event.load_number} noun="Load" /> : null,
              `${CROSSING_LABELS[event.crossing_point] ?? event.crossing_point} · ${event.direction}`,
            ],
            onOpen: openLoad(event.load_uuid),
          }))}
        />
        <OverviewTable
          title="Out-of-service"
          viewAllHref="/dispatch/in-transit-issues"
          columns={[...UNIT_DRIVER_LOAD, { label: "Reason" }]}
          query={oosLoadsQ}
          errorMessage="Couldn't load out-of-service loads."
          emptyMessage="No dispatch-blocked units on active loads."
          rows={oosLoads.slice(0, PANEL_ROW_LIMIT).map((load: DispatchLoad) => ({
            key: load.id,
            cells: [
              <EntityLinkOrTombstone kind="unit" id={load.assigned_unit_id} name={load.unit_number} noun="Unit" />,
              <EntityLinkOrTombstone kind="driver" id={load.assigned_primary_driver_id} name={load.driver_short_name} noun="Driver" />,
              <EntityLink kind="load" id={load.id} label={entityLabel(load.load_number, load.id, "Load")} />,
              load.dispatch_block_reason ?? null,
            ],
            onOpen: openLoad(load.id),
          }))}
        />
      </div>
    </div>
  );
}
