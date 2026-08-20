import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import {
  ACTIVITY_WINDOW_OPTIONS,
  getActiveDriverSet,
  getLatestCsa,
  getSafetyAccidents,
  getSafetyEventKpis,
  getSafetyKpis,
  listSafetyEventLog,
  type ActiveDriverSetThresholdDays,
  type SafetyEventLogRow,
} from "../../../api/safety";
import { SAFETY_ALIAS_TABS, SAFETY_GROUPS } from "../../../components/safety/SAFETY_TABS_CONFIG";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";

// S-11: Safety previously had no dedicated landing dashboard — `/safety` redirected straight into the
// "Incidents & Claims" tab, with no company-wide aggregate view. This is the missing home page.
// Every number here reads an EXISTING endpoint already consumed elsewhere in Safety (events-log kpis,
// dashboard kpis, latest CSA cache, accidents list) — no new backend route, no fabricated data. A query
// that errors renders an explicit "Unavailable" state, never a fake 0.
//
// SAFETY-KPI-DRILLTHROUGH: the KPI tiles now navigate to their scoped list surfaces (never a bare
// `/safety`), and the "Records needing attention" panel below drills straight to the specific
// driver / unit / record behind the numbers via the CI-verified EntityLink detail routes
// (/drivers/:id, /fleet/units/:id) — using ids the backend already returns (accidents.driver_id/
// unit_id, events-log subject_driver_id/subject_unit_id). No API extension, no fabricated route.

function KpiTile({
  label,
  value,
  isError,
  isLoading,
  to,
}: {
  label: string;
  value: number | string;
  isError?: boolean;
  isLoading?: boolean;
  to?: string;
}) {
  const inner = (
    <>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      {isError ? (
        <div className="text-sm font-semibold text-red-600" data-testid="safety-home-kpi-error">
          Unavailable
        </div>
      ) : isLoading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="text-xl font-semibold text-slate-900">{value}</div>
      )}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        data-testid="safety-home-kpi-link"
        className="block rounded-sm border border-gray-200 bg-white px-3 py-2 transition hover:border-slate-300 hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        {inner}
      </Link>
    );
  }

  return <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">{inner}</div>;
}

/** Accidents have no `status` column on prod — triage by recent accident_at instead. */
const RECENT_ACCIDENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function isRecentAccident(accidentAt: unknown): boolean {
  if (accidentAt == null || accidentAt === "") return false;
  const ts = new Date(String(accidentAt)).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= RECENT_ACCIDENT_WINDOW_MS;
}

type DrillRecord = {
  key: string;
  when: string;
  label: string;
  driverId: string | null;
  driverLabel: string;
  unitId: string | null;
  unitLabel: string;
  detailTo: string | null;
};

function DrillRow({ record }: { record: DrillRecord }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100 py-1.5 text-xs last:border-b-0"
      data-testid="safety-home-drill-row"
    >
      <span className="w-20 shrink-0 text-slate-500">{record.when || "—"}</span>
      <span className="min-w-[8rem] flex-1 text-slate-700">{record.label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-slate-400">Driver</span>
        <EntityLink
          kind="driver"
          id={record.driverId}
          label={record.driverLabel}
          data-testid="safety-home-drill-driver"
        />
      </span>
      <span className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-slate-400">Unit</span>
        <EntityLink
          kind="unit"
          id={record.unitId}
          label={record.unitLabel}
          data-testid="safety-home-drill-unit"
        />
      </span>
      {record.detailTo ? (
        <Link
          to={record.detailTo}
          className="text-slate-700 underline hover:text-slate-900"
          data-testid="safety-home-drill-record"
        >
          Open record
        </Link>
      ) : null}
    </div>
  );
}

export function SafetyHomeTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [activeDriverWindow, setActiveDriverWindow] = useState<ActiveDriverSetThresholdDays>(7);

  const activeDriversQuery = useQuery({
    queryKey: ["safety", "active-driver-set", companyId, activeDriverWindow],
    queryFn: () => getActiveDriverSet(companyId, activeDriverWindow),
    enabled: Boolean(companyId),
  });

  const kpisQuery = useQuery({
    queryKey: ["safety", "kpis", companyId],
    queryFn: () => getSafetyKpis(companyId),
    enabled: Boolean(companyId),
  });
  const eventKpisQuery = useQuery({
    queryKey: ["safety", "events-v2", "kpis", companyId],
    queryFn: () => getSafetyEventKpis(companyId).then((result) => result.kpis),
    enabled: Boolean(companyId),
  });
  const csaQuery = useQuery({
    queryKey: ["safety", "csa", "latest", companyId],
    queryFn: () => getLatestCsa(companyId),
    enabled: Boolean(companyId),
  });
  const accidentsQuery = useQuery({
    queryKey: ["safety", "accidents", companyId],
    queryFn: () => getSafetyAccidents(companyId),
    enabled: Boolean(companyId),
  });
  // SAFETY-KPI-DRILLTHROUGH: open events carry subject_driver_id / subject_unit_id / id — the ids the
  // drill panel deep-links with. Reuses the existing events-log endpoint (no new API surface).
  const openEventsQuery = useQuery({
    queryKey: ["safety", "events-log", "open", companyId],
    queryFn: () => listSafetyEventLog(companyId, { status: "open" }).then((result) => result.events),
    enabled: Boolean(companyId),
  });

  const drillRecords = useMemo<DrillRecord[]>(() => {
    const accidents = (accidentsQuery.data?.accidents ?? []) as Array<Record<string, unknown>>;
    // safety.accident_reports has no status column (Neon prod verified). Filter by accident_at
    // recent window so the panel shows recent accidents, not a phantom open-status triage.
    const recentAccidents = accidents.filter(
      (row) => isRecentAccident(row.accident_at) && (row.driver_id || row.unit_id)
    );
    const topAccidents = recentAccidents.slice(0, 5);
    const accidentRecords: DrillRecord[] = topAccidents.map((row) => {
        const id = String(row.id ?? "");
        return {
          key: `accident-${id}`,
          when: formatDateUS(row.accident_at),
          label: `Accident${row.location ? ` · ${String(row.location)}` : ""}`,
          driverId: (row.driver_id as string | null) ?? null,
          driverLabel: entityLabel(row.driver_name, row.driver_id, "Driver"),
          unitId: (row.unit_id as string | null) ?? null,
          unitLabel: entityLabel(row.unit_number, row.unit_id, "Unit"),
          // C-13 / LST-F104: AccidentsPage already honors ?accident_id= (opens drawer). Leaving
          // detailTo null was a dead "Open record" affordance — driver/unit links alone are not enough.
          detailTo: id ? `/safety/accidents?accident_id=${encodeURIComponent(id)}` : null,
        };
      });

    const events = (openEventsQuery.data ?? []) as SafetyEventLogRow[];
    const openEvents = events.filter((row) => row.subject_driver_id || row.subject_unit_id);
    const topEvents = openEvents.slice(0, 5);
    const eventRecords: DrillRecord[] = topEvents.map((row) => ({
      key: `event-${row.id}`,
      when: formatDateUS(row.occurred_at),
      label: row.title || `${row.event_type} (${row.severity})`,
      driverId: row.subject_driver_id ?? null,
      driverLabel: entityLabel(row.subject_driver_name, row.subject_driver_id, "Driver"),
      unitId: row.subject_unit_id ?? null,
      unitLabel: entityLabel(row.subject_unit_number, row.subject_unit_id, "Unit"),
      // C-13 / LST-F106: SafetyEventsPage honors ?event_id= (opens detail panel).
      detailTo: row.id ? `/safety/safety-events?event_id=${encodeURIComponent(row.id)}` : null,
    }));

    return [...eventRecords, ...accidentRecords];
  }, [accidentsQuery.data?.accidents, openEventsQuery.data]);

  const drillLoading = accidentsQuery.isPending || openEventsQuery.isPending;
  const drillError = accidentsQuery.isError && openEventsQuery.isError;

  if (!companyId) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-slate-600">
        Select an operating company to view the Safety dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="safety-home">
      <div className="rounded-sm border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Safety Overview</h3>
        <p className="mt-1 text-xs text-slate-500">
          Company-wide aggregate across events, accidents, CSA, fines, and open liabilities. Tap a tile
          to open its list, or drill straight to a driver/unit below.
        </p>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-gray-200 bg-white p-3"
        data-testid="safety-home-active-drivers"
      >
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            Active Drivers (Samsara GPS activity)
          </div>
          {activeDriversQuery.isError ? (
            <div className="text-sm font-semibold text-red-600" data-testid="safety-home-active-drivers-error">
              Unavailable
            </div>
          ) : activeDriversQuery.isPending ? (
            <div className="text-sm text-slate-400">Loading…</div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-slate-900">
                {activeDriversQuery.data?.active_driver_uuids.length ?? 0}
              </span>
              <span className="text-xs text-slate-500">
                of {activeDriversQuery.data?.total_driver_count ?? 0} drivers
              </span>
              {/* §7 LOCKED palette — no amber/yellow status bands; both states stay in the slate
                  family, distinguished by text only ("Cached" vs "Recomputed live"). */}
              <span
                className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                data-testid="safety-home-active-drivers-freshness"
                title={
                  activeDriversQuery.data?.snapshot_at
                    ? `Snapshot at ${formatDateUS(activeDriversQuery.data.snapshot_at)}`
                    : undefined
                }
              >
                {activeDriversQuery.data?.cache_hit ? "Cached" : "Recomputed live"}
              </span>
            </div>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Window
          <select
            aria-label="Active driver window (days)"
            value={activeDriverWindow}
            onChange={(event) =>
              setActiveDriverWindow(Number(event.target.value) as ActiveDriverSetThresholdDays)
            }
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
            data-testid="safety-home-active-drivers-window"
          >
            {ACTIVITY_WINDOW_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile
          label="Total Safety Events"
          value={Number(eventKpisQuery.data?.total ?? 0)}
          isError={eventKpisQuery.isError}
          isLoading={eventKpisQuery.isPending}
          to="/safety/safety-events"
        />
        <KpiTile
          label="Open Safety Events"
          value={Number(eventKpisQuery.data?.open_count ?? 0)}
          isError={eventKpisQuery.isError}
          isLoading={eventKpisQuery.isPending}
          to="/safety/safety-events"
        />
        <KpiTile
          label="Severe Events"
          value={Number(eventKpisQuery.data?.severe_count ?? 0)}
          isError={eventKpisQuery.isError}
          isLoading={eventKpisQuery.isPending}
          to="/safety/safety-events"
        />
        <KpiTile
          label="Accidents on File"
          value={(accidentsQuery.data?.accidents ?? []).length}
          isError={accidentsQuery.isError}
          isLoading={accidentsQuery.isPending}
          to="/safety/accidents"
        />
        <KpiTile
          label="Open Company Violations"
          value={Number((kpisQuery.data as Record<string, unknown> | undefined)?.open_company_violations ?? 0)}
          isError={kpisQuery.isError}
          isLoading={kpisQuery.isPending}
          // C-06: land on company-violation filter (merged into External Fines) — bare /external-fines
          // defaulted to driver-fine and looked like a dead/wrong tile.
          to="/safety/external-fines?record_type=company-violation"
        />
        <KpiTile
          label="Drivers with Open Fines"
          value={Number((kpisQuery.data as Record<string, unknown> | undefined)?.drivers_with_open_fines ?? 0)}
          isError={kpisQuery.isError}
          isLoading={kpisQuery.isPending}
          // Align with SafetyKpiRow — internal fines surface (not external-fines default).
          to="/safety/internal-fines"
        />
        <KpiTile
          label="Critical Integrity Alerts"
          value={Number((kpisQuery.data as Record<string, unknown> | undefined)?.critical_integrity_alerts ?? 0)}
          isError={kpisQuery.isError}
          isLoading={kpisQuery.isPending}
          to="/safety/integrity-alerts"
        />
        <KpiTile
          label="Internal inspection points"
          value={
            csaQuery.data?.latest?.total_violations == null
              ? "Unavailable"
              : Number(csaQuery.data.latest.total_violations)
          }
          isError={csaQuery.isError}
          isLoading={csaQuery.isPending}
          to="/safety/csa-score"
        />
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-4" data-testid="safety-home-drilldown">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Open events & recent accidents (30d)
        </h4>
        <p className="mb-2 text-[11px] text-slate-400">
          Open safety events plus driver-/unit-linked accidents from the last 30 days (by accident date).
        </p>
        {drillError ? (
          <div className="text-sm font-semibold text-red-600" data-testid="safety-home-drill-error">
            Unavailable
          </div>
        ) : drillLoading ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : drillRecords.length === 0 ? (
          <div className="text-xs text-slate-500">
            No open events or recent driver-/unit-linked accidents right now.
          </div>
        ) : (
          <div>
            {drillRecords.map((record) => (
              <DrillRow key={record.key} record={record} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Jump to a Safety area</h4>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {SAFETY_GROUPS.map((group) => (
            <Link
              key={group.id}
              to={group.tabs[0]?.route ?? "/safety/home"}
              className="rounded-sm border border-gray-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {group.label}
            </Link>
          ))}
        </div>
      </div>

      {/* SAF-F22: alias surfaces (Training Programs/Records, ELD Audit Trail, 425C, Reports, Photo Comparison, Cert Expiry)
          were mounted with zero inbound nav — secondary Home quick-jumps so operators reach them without typing URLs. */}
      <div className="rounded-sm border border-gray-200 bg-white p-4" data-testid="safety-home-alias-quick-jumps">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Compliance &amp; audit tools</h4>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {SAFETY_ALIAS_TABS.map(({ tab }) => (
            <Link
              key={tab.id}
              to={tab.route}
              className="rounded-sm border border-gray-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              data-testid={`safety-home-alias-${tab.id}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
