import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import {
  getDetentionBoard,
  getDispatchDashboard,
  listAtRiskDispatchLoads,
  listDispatchLoads,
  listLateArrivalDispatchLoads,
  listUnitsWithoutLoad,
  type AtRiskLoadRow,
  type DetentionBoardEvent,
  type DispatchLoad,
  type UnitsWithoutLoad,
} from "../../api/dispatch";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { colors, spacing, typography } from "../../design/tokens";

type Props = {
  operatingCompanyId: string;
  onLoadClick?: (loadId: string) => void;
};

type BorderCrossingEvent = {
  uuid: string;
  vehicle_id: string;
  driver_uuid: string | null;
  load_uuid: string | null;
  crossing_point: string;
  direction: string;
  entered_geofence_at: string;
};

const PANEL_ROW_LIMIT = 6;

const CROSSING_LABELS: Record<string, string> = {
  "laredo-i": "Laredo I",
  "laredo-ii": "Laredo II",
  "laredo-iii": "World Trade",
  "laredo-iv": "Colombia",
  colombia: "Colombia",
  other: "Other",
};

function shortId(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function KpiCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div
      className="bg-white"
      style={{
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: spacing.radiusCard,
        padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`,
      }}
      data-testid={`dispatch-overview-kpi-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
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
    </div>
  );
}

function PanelRow({
  unit,
  driver,
  loadCustomer,
  onClick,
}: {
  unit: string;
  driver: string;
  loadCustomer: string;
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
      {onClick ? <span className="shrink-0 text-[11px] text-blue-600">open →</span> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left hover:bg-gray-50">
        <DataPanelRow>{content}</DataPanelRow>
      </button>
    );
  }

  return <DataPanelRow>{content}</DataPanelRow>;
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

export function DispatchOverview({ operatingCompanyId, onLoadClick }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const enabled = Boolean(operatingCompanyId);

  const dashboardQ = useQuery({
    queryKey: ["dispatch", "overview", "dashboard", operatingCompanyId],
    queryFn: () => getDispatchDashboard(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const atRiskQ = useQuery({
    queryKey: ["dispatch", "overview", "at-risk", operatingCompanyId],
    queryFn: () => listAtRiskDispatchLoads(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const lateQ = useQuery({
    queryKey: ["dispatch", "overview", "late-arrivals", operatingCompanyId],
    queryFn: () => listLateArrivalDispatchLoads(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const unitsWithoutLoadQ = useQuery({
    queryKey: ["dispatch", "overview", "units-without-load", operatingCompanyId],
    queryFn: () => listUnitsWithoutLoad(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  const exposureLoadsQ = useQuery({
    queryKey: ["dispatch", "overview", "round-trip-exposure", operatingCompanyId],
    queryFn: () =>
      listDispatchLoads({
        operating_company_id: operatingCompanyId,
        view: "home",
        limit: 20,
        offset: 0,
        status: ["dispatched", "in_transit"],
      }),
    enabled,
    refetchInterval: 60_000,
  });

  const oosLoadsQ = useQuery({
    queryKey: ["dispatch", "overview", "oos-loads", operatingCompanyId],
    queryFn: () =>
      listDispatchLoads({
        operating_company_id: operatingCompanyId,
        view: "home",
        limit: 50,
        offset: 0,
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

  const atRiskCount = atRiskQ.data?.loads.length ?? 0;
  const lateCount = lateQ.data?.count ?? 0;
  const atRiskLateTotal = atRiskCount + lateCount;

  const oosLoads = useMemo(
    () => (oosLoadsQ.data?.loads ?? []).filter((load) => load.is_dispatch_blocked),
    [oosLoadsQ.data?.loads]
  );

  const exposureLoads = exposureLoadsQ.data?.loads ?? [];
  const atRiskLoads = atRiskQ.data?.loads ?? [];
  const detentionEvents = detentionQ.data?.events ?? [];
  const borderEvents = borderQ.data?.data ?? [];

  if (!enabled) {
    return (
      <div className="rounded border bg-white p-4 text-sm text-slate-600" data-testid="dispatch-overview-page">
        Select an operating company.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="dispatch-overview-page">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <KpiCard
          label="Active loads"
          value={dashboardQ.isLoading ? "—" : (dashboardQ.data?.active_loads ?? 0)}
          hint={dashboardQ.data ? `${dashboardQ.data.in_transit} in transit` : undefined}
        />
        <KpiCard
          label="At-risk / late"
          value={atRiskQ.isLoading || lateQ.isLoading ? "—" : atRiskLateTotal}
          hint={atRiskLateTotal > 0 ? `${atRiskCount} at-risk · ${lateCount} late` : "none flagged"}
        />
        <KpiCard label="Units available" value={unitsWithoutLoadQ.isLoading ? "—" : unitsAvailable} hint="idle, no active load" />
        <KpiCard
          label="Units needing return"
          value={unitsWithoutLoadQ.isLoading ? "—" : unitsNeedingReturn}
          hint="recent drop, no return booked"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DataPanel title="Unassigned units" viewAllHref="/dispatch?view=loads" accentColor={colors.dispatch.strong}>
          {unitsWithoutLoadQ.isLoading ? (
            <PanelLoading />
          ) : unitsWithoutLoad.length === 0 ? (
            PanelEmpty("All units currently have active loads.")
          ) : (
            unitsWithoutLoad.slice(0, PANEL_ROW_LIMIT).map((unit: UnitsWithoutLoad) => (
              <PanelRow
                key={unit.id}
                unit={unit.unit_number}
                driver={unit.driver_name ?? "—"}
                loadCustomer="Need load"
              />
            ))
          )}
        </DataPanel>

        <DataPanel title="Round-trip exposure" viewAllHref="/dispatch?view=loads" accentColor={colors.dispatch.strong}>
          {exposureLoadsQ.isLoading ? (
            <PanelLoading />
          ) : exposureLoads.length === 0 ? (
            PanelEmpty("No in-transit or dispatched loads.")
          ) : (
            exposureLoads.slice(0, PANEL_ROW_LIMIT).map((load: DispatchLoad) => (
              <PanelRow
                key={load.id}
                unit={load.unit_number ?? "—"}
                driver={load.driver_short_name ?? "—"}
                loadCustomer={`${load.load_number} · ${load.customer_name ?? "—"}`}
                onClick={onLoadClick ? () => onLoadClick(load.id) : undefined}
              />
            ))
          )}
        </DataPanel>

        <DataPanel title="At-Risk queue" viewAllHref="/dispatch/at-risk" accentColor={colors.crit.strong}>
          {atRiskQ.isLoading ? (
            <PanelLoading />
          ) : atRiskLoads.length === 0 ? (
            PanelEmpty("No at-risk loads right now.")
          ) : (
            atRiskLoads.slice(0, PANEL_ROW_LIMIT).map((load: AtRiskLoadRow) => (
              <PanelRow
                key={load.id}
                unit={load.unit_number ?? "—"}
                driver={load.driver_name ?? "—"}
                loadCustomer={`${load.load_number} · ${load.customer_name ?? "—"}`}
                onClick={onLoadClick ? () => onLoadClick(load.id) : undefined}
              />
            ))
          )}
        </DataPanel>

        <DataPanel title="Detention board" viewAllHref="/dispatch/detention" accentColor={colors.warn.strong}>
          {detentionQ.isLoading ? (
            <PanelLoading />
          ) : detentionEvents.length === 0 ? (
            PanelEmpty("No active detention events.")
          ) : (
            detentionEvents.slice(0, PANEL_ROW_LIMIT).map((event: DetentionBoardEvent) => (
              <PanelRow
                key={event.id}
                unit="—"
                driver={event.driver_name ?? "—"}
                loadCustomer={`${event.load_number} · ${event.customer_name ?? "—"}`}
                onClick={onLoadClick ? () => onLoadClick(event.load_id) : undefined}
              />
            ))
          )}
        </DataPanel>

        <DataPanel title="Border crossings" viewAllHref="/dispatch/border-crossing" accentColor={colors.info.strong}>
          {borderQ.isLoading ? (
            <PanelLoading />
          ) : borderEvents.length === 0 ? (
            PanelEmpty("No border crossings in the last 7 days.")
          ) : (
            borderEvents.slice(0, PANEL_ROW_LIMIT).map((event) => (
              <PanelRow
                key={event.uuid}
                unit={shortId(event.vehicle_id)}
                driver={shortId(event.driver_uuid)}
                loadCustomer={
                  event.load_uuid
                    ? shortId(event.load_uuid)
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
          ) : oosLoads.length === 0 ? (
            PanelEmpty("No dispatch-blocked units on active loads.")
          ) : (
            oosLoads.slice(0, PANEL_ROW_LIMIT).map((load: DispatchLoad) => (
              <PanelRow
                key={load.id}
                unit={load.unit_number ?? "—"}
                driver={load.driver_short_name ?? "—"}
                loadCustomer={`${load.load_number} · ${load.dispatch_block_reason ?? "Blocked"}`}
                onClick={onLoadClick ? () => onLoadClick(load.id) : undefined}
              />
            ))
          )}
        </DataPanel>
      </div>
    </div>
  );
}
