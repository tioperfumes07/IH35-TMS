import { useMemo, type CSSProperties, type ReactNode } from "react";
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
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { colors, spacing, typography } from "../../design/tokens";
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

// DSP-KPI-ON-LOAD (owner ruling 2026-09-09): "Active loads" = only trucks that actually HAVE a load
// out. countOnLoadDispatchLoads() (backend `on_load`) counts these same five statuses; the drill URL
// carries the identical set so the tile and its table agree. delivered_pending_docs is DELIBERATELY
// excluded here — with AlwaysTrack docs always in, a delivered load belongs to the factoring/billing
// pipeline, surfaced by its own "Delivered — pending docs" tile drilling to /dispatch/factoring-queue.
const ACTIVE_LOAD_DRILL_STATUSES = [
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
  // KPI tiles: centered content, light tile bg + darker border (owner ruling 2026-09-04 — no
  // white-on-white, all KPI values centered). Tokens transcribed from GLOBAL-TYPE-SIZE-BASELINE.
  const style: CSSProperties = {
    border: `1px solid ${colors.kpiTileBorder}`,
    backgroundColor: colors.kpiTileBg,
    borderRadius: spacing.radiusCard,
    padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`,
    textAlign: "center",
    opacity: disabled ? 0.72 : 1,
  };
  const body = (
    <>
      <p
        className="uppercase"
        style={{
          fontSize: typography.sectionSubhead,
          fontWeight: 700,
          letterSpacing: typography.tightUpper,
          color: colors.mutedText,
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: typography.pageHeading, fontWeight: 600, color: colors.pageHeading, lineHeight: 1.2 }}>{value}</p>
      {hint ? <p style={{ fontSize: typography.bodyTextSmall, color: colors.mutedText }}>{hint}</p> : null}
    </>
  );
  // B10 dead-click rollout: `to` drills into the existing dispatch board/queue that already owns this
  // metric's data (e.g. the At-Risk queue panel just below uses the same /dispatch/at-risk href).
  if (disabled) {
    return (
      <div
        className="cursor-not-allowed"
        style={style}
        data-testid={testId}
        aria-disabled="true"
        title={disabledReason}
        data-kpi-disabled="true"
      >
        {body}
      </div>
    );
  }
  if (to) {
    return (
      <Link to={to} data-testid={testId} className="block transition hover:shadow-xs" style={style}>
        {body}
      </Link>
    );
  }
  return (
    <div style={style} data-testid={testId}>
      {body}
    </div>
  );
}

function PanelRow({
  unit,
  driver,
  loadCustomer,
  onClick,
}: {
  unit: ReactNode;
  driver: ReactNode;
  loadCustomer: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span style={{ color: colors.bodyText }} className="truncate">
        <span className="font-medium">{unit}</span>
        <span style={{ color: colors.mutedText }}> · </span>
        {driver}
        <span style={{ color: colors.mutedText }}> · </span>
        {loadCustomer}
      </span>
      {onClick ? <button type="button" onClick={onClick} className="shrink-0 text-[11px] text-slate-700 hover:underline">open →</button> : null}
    </>
  );

  return <DataPanelRow>{content}</DataPanelRow>;
}

// REG-038 (owner 2026-09-10/11, verbatim: "each kpi must have its own columns and look clean" /
// "one column each for Unit, Driver, Load"): PanelRow above concatenates unit/driver/load into ONE
// span joined by " · " -- readable, but not actually columns. KpiColumnHeader + KpiColumnRow render a
// real CSS grid with a labeled header row, reused by every REG-038 panel below (Units needing return,
// Unassigned units, Round-trip exposure, Days since last delivery) so all four share one column
// contract instead of four hand-rolled layouts.
function KpiColumnHeader({ columns }: { columns: string[] }) {
  return (
    <div
      className="grid gap-2 border-b pb-1"
      style={{
        gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
        borderBottomColor: colors.cardBorder,
        marginBottom: 2,
      }}
    >
      {columns.map((column) => (
        <span
          key={column}
          className="truncate uppercase"
          style={{ fontSize: typography.panelHeader, fontWeight: 700, letterSpacing: typography.tightUpper, color: colors.columnHeader }}
        >
          {column}
        </span>
      ))}
    </div>
  );
}

function KpiColumnRow({ cells, onClick }: { cells: ReactNode[]; onClick?: () => void }) {
  const content = (
    <div className="grid min-w-0 flex-1 items-center gap-2" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
      {cells.map((cell, i) => (
        <span key={i} className="truncate" style={{ color: colors.bodyText }}>
          {cell}
        </span>
      ))}
    </div>
  );
  return (
    <DataPanelRow>
      {content}
      {/* GLOBAL-TYPE-SIZE-BASELINE ratchet (verify-ui-design-system-ratchet.mjs): no NEW raw
          text-[Npx] bracket class, even an on-scale one -- token-driven inline style instead,
          matching this same "open →" affordance's own token elsewhere in this file. */}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="shrink-0 text-slate-700 hover:underline"
          style={{ fontSize: typography.bodyTextSmall }}
        >
          open →
        </button>
      ) : null}
    </DataPanelRow>
  );
}

/** Real Load reference for a unit's last delivery, or an honest "—" when the unit has never
 * delivered one (a brand-new/leased-in truck). REG-038: replaces the placeholder strings
 * "Return load not booked" / "Need load" that told the dispatcher nothing concrete to click. */
function LastLoadCell({ unit }: { unit: UnitsWithoutLoad }) {
  if (!unit.last_delivered_load_id) return <span style={{ color: colors.mutedText }}>—</span>;
  return (
    <EntityLinkOrTombstone
      kind="load"
      id={unit.last_delivered_load_id}
      name={unit.last_delivered_load_number}
      noun="Load"
    />
  );
}

function PanelLoading() {
  return (
    <DataPanelRow>
      <span style={{ color: colors.mutedText, fontSize: typography.bodyTextSmall }}>Loading…</span>
    </DataPanelRow>
  );
}

function PanelEmpty(message: string) {
  return (
    <DataPanelRow>
      <span style={{ color: colors.mutedText, fontSize: typography.bodyTextSmall }}>{message}</span>
    </DataPanelRow>
  );
}

// DISPATCH-OVERVIEW-PANEL-ISERROR-SWALLOWED: five panels below checked isLoading but never
// isError, so a failed fetch fell through to the PanelEmpty branch — a false all-clear
// indistinguishable from "genuinely nothing to review" on a dispatcher-facing home dashboard.
function PanelError(message: string, onRetry: () => void) {
  return (
    <DataPanelRow>
      <span style={{ color: colors.crit.strong, fontSize: typography.bodyTextSmall }}>
        {message}{" "}
        <button
          type="button"
          onClick={onRetry}
          style={{ color: colors.crit.strong, textDecoration: "underline", cursor: "pointer" }}
        >
          Retry
        </button>
      </span>
    </DataPanelRow>
  );
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
  const maxDaysIdle = sortedByDaysIdle.length > 0 ? Math.floor((sortedByDaysIdle[0]!.hours_since_last_delivery ?? 0) / 24) : null;

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
      <div className="rounded-sm border bg-white p-4 text-xs text-slate-600" data-testid="dispatch-overview-page">
        Select an operating company.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="dispatch-overview-page">
      <section className="space-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Loads — live board</h2>
        <p className="text-[11px] text-gray-500">
          Tile value must equal the drill table row count. At-risk / late counts each load once (union, not a sum).
        </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
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
          value={
            atRiskLateQ.isLoading || atRiskLateQ.isError ? "—" : atRiskLateTotal
          }
          hint="Union of at-risk and late — each load once. Detention is its own tile."
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
        {/* REG-038 (owner 2026-09-10/11): "Round-trip exposure" already existed as a drill panel
            below with real data, but had no top-level tile of its own -- a dispatcher scanning the
            KPI strip could not see the count without scrolling. */}
        <KpiCard
          label="Round-trip exposure"
          value={exposureLoadsQ.isLoading || exposureLoadsQ.isError ? "—" : exposureLoads.length}
          hint="dispatched/in-transit, no return leg confirmed"
          to="/dispatch#round-trip-exposure"
        />
        {/* REG-038: net-new KPI. hours_since_last_delivery was already computed live by the backend
            but only ever shown as inline text inside "Units needing return"; it had no tile and no
            own breakdown. maxDaysIdle is null (never a fake 0) when no unit is currently idle. */}
        <KpiCard
          label="Days since last delivery"
          value={unitsWithoutLoadQ.isLoading || unitsWithoutLoadQ.isError ? "—" : maxDaysIdle == null ? "—" : `${maxDaysIdle}d`}
          hint={maxDaysIdle == null ? "no idle units" : "longest idle unit, no return booked"}
          to="/dispatch#days-since-last-delivery"
        />
      </div>
      </section>

      {dashboardQ.isError ? (
        <div data-testid="dispatch-overview-dashboard-error">
          {PanelError("Couldn't load the Dispatch overview totals.", () => void dashboardQ.refetch())}
        </div>
      ) : null}

      <DispatchLoadCostsPanel operatingCompanyId={operatingCompanyId} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div id="units-needing-return" data-testid="dispatch-units-needing-return-panel">
          <DataPanel title="Units needing return" accentColor={colors.dispatch.strong}>
            {unitsWithoutLoadQ.isLoading ? (
              <PanelLoading />
            ) : unitsWithoutLoadQ.isError ? (
              PanelError("Couldn't load units needing return.", () => void unitsWithoutLoadQ.refetch())
            ) : returnUnits.length === 0 ? (
              PanelEmpty("No delivered units are waiting for a return load.")
            ) : (
              <>
                {/* REG-038: own columns (Unit/Driver/Load), Load = the real last-delivered load via
                    LastLoadCell -- replaces the old "Return load not booked" placeholder string. */}
                <KpiColumnHeader columns={["Unit", "Driver", "Load"]} />
                {/* Tile-value law (this file, above): the "Units needing return" KPI drills straight to
                    THIS panel (no separate list page exists for a fleet-bounded dataset), so the panel
                    must render every row the tile counted -- a PANEL_ROW_LIMIT slice here would silently
                    hide units past the 6th once the fleet has more than that many, breaking the promise. */}
                {returnUnits.map((unit) => (
                  <KpiColumnRow
                    key={unit.id}
                    cells={[
                      <EntityLinkOrTombstone kind="unit" id={unit.id} name={unit.unit_number} noun="Unit" />,
                      <EntityLinkOrTombstone kind="driver" id={unit.driver_id} name={unit.driver_name} noun="Driver" />,
                      <LastLoadCell unit={unit} />,
                    ]}
                  />
                ))}
              </>
            )}
          </DataPanel>
        </div>
        <div id="unassigned-units" data-testid="dispatch-unassigned-units-panel">
          <DataPanel title="Unassigned units" viewAllHref="/dispatch?view=list" accentColor={colors.dispatch.strong}>
            {unitsWithoutLoadQ.isLoading ? (
              <PanelLoading />
            ) : unitsWithoutLoadQ.isError ? (
              PanelError("Couldn't load unassigned units.", () => void unitsWithoutLoadQ.refetch())
            ) : unitsWithoutLoad.length === 0 ? (
              PanelEmpty("All units currently have active loads.")
            ) : (
              <>
                {/* REG-038: own columns (Unit/Driver/Load); Load shows the unit's real last-delivered
                    load (LastLoadCell), an honest "—" for a unit that has never delivered one --
                    replaces the old unconditional "Need load" placeholder string. */}
                <KpiColumnHeader columns={["Unit", "Driver", "Load"]} />
                {/* Tile-value law: the "Units available" KPI (unitsAvailable = unitsWithoutLoad.length)
                    now drills straight to THIS panel via #unassigned-units, so every counted unit must
                    render here -- see the matching comment on "Units needing return" above. */}
                {unitsWithoutLoad.map((unit: UnitsWithoutLoad) => (
                  <KpiColumnRow
                    key={unit.id}
                    cells={[
                      <EntityLinkOrTombstone kind="unit" id={unit.id} name={unit.unit_number} noun="Unit" />,
                      <EntityLinkOrTombstone kind="driver" id={unit.driver_id} name={unit.driver_name} noun="Driver" />,
                      <LastLoadCell unit={unit} />,
                    ]}
                  />
                ))}
              </>
            )}
          </DataPanel>
        </div>
        <div id="days-since-last-delivery" data-testid="dispatch-days-since-last-delivery-panel">
          {/* REG-038: net-new KPI + panel. hours_since_last_delivery was already computed live by the
              backend but had no tile and no breakdown of its own -- only ever inline text buried
              inside "Units needing return". Own columns per the owner's ask, PLUS a 4th "Days idle"
              column since the day-count IS this KPI's whole point, sorted worst-first so the unit
              most overdue for a return is always the top row. Same "must render every counted row,
              no PANEL_ROW_LIMIT slice" law as the two panels above -- the tile is this list's own
              worst-case entry, not a separately-fetched count, so they can never disagree. */}
          <DataPanel
            title="Days since last delivery"
            accentColor={colors.dispatch.strong}
            titleHint="Idle units (no active load), sorted by longest since their last confirmed delivery first."
          >
            {unitsWithoutLoadQ.isLoading ? (
              <PanelLoading />
            ) : unitsWithoutLoadQ.isError ? (
              PanelError("Couldn't load days since last delivery.", () => void unitsWithoutLoadQ.refetch())
            ) : sortedByDaysIdle.length === 0 ? (
              PanelEmpty("No idle units — every unit either has a load or has never delivered one yet.")
            ) : (
              <>
                <KpiColumnHeader columns={["Unit", "Driver", "Load", "Days idle"]} />
                {sortedByDaysIdle.map((unit) => (
                  <KpiColumnRow
                    key={unit.id}
                    cells={[
                      <EntityLinkOrTombstone kind="unit" id={unit.id} name={unit.unit_number} noun="Unit" />,
                      <EntityLinkOrTombstone kind="driver" id={unit.driver_id} name={unit.driver_name} noun="Driver" />,
                      <LastLoadCell unit={unit} />,
                      `${Math.floor((unit.hours_since_last_delivery ?? 0) / 24)}d`,
                    ]}
                  />
                ))}
              </>
            )}
          </DataPanel>
        </div>

        <div id="round-trip-exposure" data-testid="dispatch-round-trip-exposure-panel">
          <DataPanel
            title="Round-trip exposure" viewAllHref="/dispatch?view=list"
            titleHint="Loads whose truck is currently dispatched or in transit — out on the road, no return leg confirmed complete yet."
            accentColor={colors.dispatch.strong}
          >
            {exposureLoadsQ.isLoading ? (
              <PanelLoading />
            ) : exposureLoadsQ.isError ? (
              PanelError("Couldn't load round-trip exposure.", () => void exposureLoadsQ.refetch())
            ) : exposureLoads.length === 0 ? (
              PanelEmpty("No in-transit or dispatched loads.")
            ) : (
              <>
                {/* REG-038: own columns (Unit/Driver/Load) -- was one PanelRow concatenating unit ·
                    driver · load · customer into a single span. Customer now rides as a muted
                    parenthetical inside the Load cell so no information is dropped, while the KPI
                    still keeps exactly the three columns the owner named as the reference pattern.
                    Tile-value law: the top "Round-trip exposure" KPI tile is exposureLoads.length,
                    so this panel can no longer PANEL_ROW_LIMIT-slice -- see the query limit bump on
                    exposureLoadsQ above. */}
                <KpiColumnHeader columns={["Unit", "Driver", "Load"]} />
                {exposureLoads.map((load: DispatchLoad) => (
                  <KpiColumnRow
                    key={load.id}
                    cells={[
                      <EntityLinkOrTombstone kind="unit" id={load.assigned_unit_id} name={load.unit_number} noun="Unit" />,
                      <EntityLinkOrTombstone kind="driver" id={load.assigned_primary_driver_id} name={load.driver_short_name} noun="Driver" />,
                      <>
                        <EntityLink kind="load" id={load.id} label={entityLabel(load.load_number, load.id, "Load")} />{" "}
                        <span style={{ color: colors.mutedText }}>
                          (<EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" />)
                        </span>
                      </>,
                    ]}
                    onClick={onLoadClick ? () => onLoadClick(load.id) : undefined}
                  />
                ))}
              </>
            )}
          </DataPanel>
        </div>

        <DataPanel title="At-risk / late loads" viewAllHref="/dispatch/at-risk" accentColor={colors.crit.strong}>
          {atRiskLateQ.isLoading ? (
            <PanelLoading />
          ) : atRiskLateQ.isError ? (
            PanelError("Couldn't load at-risk or late loads.", () => void atRiskLateQ.refetch())
          ) : atRiskLoads.length === 0 ? (
            PanelEmpty("No at-risk or late loads right now.")
          ) : (
            atRiskLoads.slice(0, PANEL_ROW_LIMIT).map((load: DispatchAlertLoadRow) => (
              <PanelRow
                key={load.id}
                unit={<EntityLinkOrTombstone kind="unit" id={load.unit_id} name={load.unit_number} noun="Unit" />}
                driver={<EntityLinkOrTombstone kind="driver" id={load.driver_id} name={load.driver_name} noun="Driver" />}
                loadCustomer={<><EntityLink kind="load" id={load.id} label={entityLabel(load.load_number, load.id, "Load")} /> · <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" /></>}
                onClick={onLoadClick ? () => onLoadClick(load.id) : undefined}
              />
            ))
          )}
        </DataPanel>

        <DataPanel
          title="Missing driver bill"
          viewAllHref="/dispatch/driver-bill-remint"
          accentColor={colors.warn.strong}
        >
          {needsDriverBillRemintQ.isLoading ? (
            <PanelLoading />
          ) : needsDriverBillRemintQ.isError ? (
            PanelError("Couldn't load the driver-bill remint queue.", () => void needsDriverBillRemintQ.refetch())
          ) : (needsDriverBillRemintQ.data?.real_count ?? 0) === 0 ? (
            PanelEmpty("Every delivered load has a driver bill.")
          ) : (
            (needsDriverBillRemintQ.data?.loads ?? [])
              .filter((load) => !load.is_sample_data)
              .slice(0, PANEL_ROW_LIMIT)
              .map((load) => (
                <PanelRow
                  key={load.id}
                  unit={<EntityLinkOrTombstone kind="load" id={load.id} name={load.load_number} noun="Load" />}
                  driver={<EntityLinkOrTombstone kind="driver" id={load.driver_id} name={load.driver_name} noun="Driver" />}
                  loadCustomer={load.status.replace(/_/g, " ")}
                />
              ))
          )}
        </DataPanel>

        <DataPanel title="Detention board" viewAllHref="/dispatch/detention" accentColor={colors.warn.strong}>
          {detentionQ.isLoading ? (
            <PanelLoading />
          ) : detentionQ.isError ? (
            PanelError("Couldn't load detention board.", () => void detentionQ.refetch())
          ) : detentionEvents.length === 0 ? (
            PanelEmpty("No active detention events.")
          ) : (
            detentionEvents.slice(0, PANEL_ROW_LIMIT).map((event: DetentionBoardEvent) => (
              <PanelRow
                key={event.id}
                unit={<EntityLinkOrTombstone kind="unit" id={event.unit_id} name={event.unit_number} noun="Unit" />}
                driver={<EntityLinkOrTombstone kind="driver" id={event.driver_id} name={event.driver_name} noun="Driver" />}
                loadCustomer={<><EntityLink kind="load" id={event.load_id} label={entityLabel(event.load_number, event.load_id, "Load")} /> · <EntityLinkOrTombstone kind="customer" id={event.customer_id} name={event.customer_name} noun="Customer" /></>}
                onClick={onLoadClick ? () => onLoadClick(event.load_id) : undefined}
              />
            ))
          )}
        </DataPanel>

        <DataPanel title="Border crossings" viewAllHref="/dispatch/border-crossing" accentColor={colors.info.strong}>
          {borderQ.isLoading ? (
            <PanelLoading />
          ) : borderQ.isError ? (
            PanelError("Couldn't load border crossings.", () => void borderQ.refetch())
          ) : borderEvents.length === 0 ? (
            PanelEmpty("No border crossings in the last 7 days.")
          ) : (
            borderEvents.slice(0, PANEL_ROW_LIMIT).map((event) => (
              <PanelRow
                key={event.uuid}
                unit={event.unit_id
                  ? <EntityLinkOrTombstone kind="unit" id={event.unit_id} name={event.unit_number} noun="Unit" />
                  : event.vehicle_id || "Unassigned"}
                driver={<EntityLinkOrTombstone kind="driver" id={event.driver_uuid} name={event.driver_name} noun="Driver" />}
                loadCustomer={
                  event.load_uuid
                    ? <EntityLinkOrTombstone kind="load" id={event.load_uuid} name={event.load_number} noun="Load" />
                    : `${CROSSING_LABELS[event.crossing_point] ?? event.crossing_point} · ${event.direction}`
                }
                onClick={event.load_uuid && onLoadClick ? () => onLoadClick(event.load_uuid!) : undefined}
              />
            ))
          )}
        </DataPanel>

        <DataPanel title="Out-of-service" viewAllHref="/dispatch/in-transit-issues" accentColor={colors.crit.strong}>
          {oosLoadsQ.isLoading ? (
            <PanelLoading />
          ) : oosLoadsQ.isError ? (
            PanelError("Couldn't load out-of-service loads.", () => void oosLoadsQ.refetch())
          ) : oosLoads.length === 0 ? (
            PanelEmpty("No dispatch-blocked units on active loads.")
          ) : (
            oosLoads.slice(0, PANEL_ROW_LIMIT).map((load: DispatchLoad) => (
              <PanelRow
                key={load.id}
                unit={<EntityLinkOrTombstone kind="unit" id={load.assigned_unit_id} name={load.unit_number} noun="Unit" />}
                driver={<EntityLinkOrTombstone kind="driver" id={load.assigned_primary_driver_id} name={load.driver_short_name} noun="Driver" />}
                loadCustomer={<><EntityLink kind="load" id={load.id} label={entityLabel(load.load_number, load.id, "Load")} /> · {load.dispatch_block_reason ?? "Blocked"}</>}
                onClick={onLoadClick ? () => onLoadClick(load.id) : undefined}
              />
            ))
          )}
        </DataPanel>
      </div>
    </div>
  );
}
