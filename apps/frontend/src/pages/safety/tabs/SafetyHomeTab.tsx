import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import {
  getLatestCsa,
  getSafetyAccidents,
  getSafetyEventKpis,
  getSafetyKpis,
  listSafetyEventLog,
  type SafetyEventLogRow,
} from "../../../api/safety";
import { SAFETY_GROUPS } from "../../../components/safety/SAFETY_TABS_CONFIG";
import { EntityLink } from "../../../components/shared/EntityLink";
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

type DrillRecord = {
  key: string;
  when: string;
  label: string;
  driverId: string | null;
  unitId: string | null;
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
        <EntityLink kind="driver" id={record.driverId} data-testid="safety-home-drill-driver" />
      </span>
      <span className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-slate-400">Unit</span>
        <EntityLink kind="unit" id={record.unitId} data-testid="safety-home-drill-unit" />
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
    const accidentRecords: DrillRecord[] = accidents
      .filter((row) => row.driver_id || row.unit_id)
      .slice(0, 5)
      .map((row) => {
        const id = String(row.id ?? "");
        return {
          key: `accident-${id}`,
          when: formatDateUS(row.accident_at),
          label: `Accident${row.location ? ` · ${String(row.location)}` : ""}`,
          driverId: (row.driver_id as string | null) ?? null,
          unitId: (row.unit_id as string | null) ?? null,
          // No per-id accident detail route exists (drawer-based list); driver/unit deep-links carry
          // the record forward, and the list is one click away via the "Accidents on File" tile.
          detailTo: null,
        };
      });

    const events = (openEventsQuery.data ?? []) as SafetyEventLogRow[];
    const eventRecords: DrillRecord[] = events
      .filter((row) => row.subject_driver_id || row.subject_unit_id)
      .slice(0, 5)
      .map((row) => ({
        key: `event-${row.id}`,
        when: formatDateUS(row.occurred_at),
        label: row.title || `${row.event_type} (${row.severity})`,
        driverId: row.subject_driver_id ?? null,
        unitId: row.subject_unit_id ?? null,
        detailTo: null,
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
        />
        <KpiTile
          label="Drivers with Open Fines"
          value={Number((kpisQuery.data as Record<string, unknown> | undefined)?.drivers_with_open_fines ?? 0)}
          isError={kpisQuery.isError}
          isLoading={kpisQuery.isPending}
          to="/safety/external-fines"
        />
        <KpiTile
          label="Critical Integrity Alerts"
          value={Number((kpisQuery.data as Record<string, unknown> | undefined)?.critical_integrity_alerts ?? 0)}
          isError={kpisQuery.isError}
          isLoading={kpisQuery.isPending}
          to="/safety/integrity-alerts"
        />
        <KpiTile
          label="CSA Score (cached)"
          value={Number(csaQuery.data?.latest?.score_total ?? csaQuery.data?.latest?.score ?? 0)}
          isError={csaQuery.isError}
          isLoading={csaQuery.isPending}
          to="/safety/csa-score"
        />
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-4" data-testid="safety-home-drilldown">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Records needing attention
        </h4>
        {drillError ? (
          <div className="text-sm font-semibold text-red-600" data-testid="safety-home-drill-error">
            Unavailable
          </div>
        ) : drillLoading ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : drillRecords.length === 0 ? (
          <div className="text-xs text-slate-500">
            No open driver- or unit-linked safety records right now.
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
    </div>
  );
}
