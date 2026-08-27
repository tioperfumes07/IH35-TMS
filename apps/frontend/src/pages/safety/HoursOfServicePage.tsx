import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDriverHosDetail } from "../../api/hos";
import { listDrivers } from "../../api/mdata";
import { listHosViolations } from "../../api/safetyV64";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { HosViolationCreateModal } from "./components/HosViolationCreateModal";
import { formatDateUS } from "../../lib/formatDate";
import { CappedListNotice } from "../../components/CappedListNotice";
import { ListErrorState } from "../../components/ListErrorState";

const ON_DUTY_STATUSES = new Set(["driving", "on_duty_not_driving", "yard_moves"]);
const NEAR_CAP_MINUTES = 30;
const ELEVEN_HOUR_CAP_MIN = 11 * 60;

export type FleetHosDriverRow = {
  driverId: string;
  driverName: string;
  currentDutyStatus: string | null;
  driveRemainingMin: number | null;
  clockStatus: "ok" | "warning_1hr" | "warning_15min" | "violation" | null;
  telemetryUnavailable: boolean;
};

function driverDisplayName(driver: { id: string; first_name?: string | null; last_name?: string | null }) {
  const name = `${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim();
  return entityLabel(name || null, driver.id, "Driver");
}

function isOnDuty(status: string | null) {
  return status != null && ON_DUTY_STATUSES.has(status);
}

function isOffDuty(status: string | null) {
  return status != null && !ON_DUTY_STATUSES.has(status);
}

function isApproachingElevenHourCap(driveRemainingMin: number | null) {
  return driveRemainingMin != null && driveRemainingMin > 0 && driveRemainingMin <= NEAR_CAP_MINUTES;
}

function isNearViolation(row: FleetHosDriverRow) {
  if (row.clockStatus === "warning_15min" || row.clockStatus === "violation") return true;
  return isApproachingElevenHourCap(row.driveRemainingMin);
}

export function formatDutyStatus(status: string | null) {
  if (!status) return "—";
  return status.replace(/_/g, " ");
}

export function formatDriveRemaining(minutes: number | null) {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hrs}h ${mins}m`;
}

export function computeHosDashboardMetrics(rows: FleetHosDriverRow[]) {
  const onDuty = rows.filter((row) => isOnDuty(row.currentDutyStatus)).length;
  const offDuty = rows.filter((row) => isOffDuty(row.currentDutyStatus)).length;
  const approachingCap = rows.filter((row) => isApproachingElevenHourCap(row.driveRemainingMin)).length;
  const nearViolations = rows.filter(isNearViolation);
  return { onDuty, offDuty, approachingCap, nearViolations };
}

async function loadFleetHosRows(
  operatingCompanyId: string,
  fleetSearch: string
): Promise<{ rows: FleetHosDriverRow[]; total?: number; failedDriverCount: number }> {
  const { drivers, total } = await listDrivers({
    operating_company_id: operatingCompanyId,
    status: "Active",
    limit: 200,
    search: fleetSearch || undefined,
  });
  const rows = await Promise.all(
    drivers.map(async (driver) => {
      const base: FleetHosDriverRow = {
        driverId: driver.id,
        driverName: driverDisplayName(driver),
        currentDutyStatus: null,
        driveRemainingMin: null,
        clockStatus: null,
        telemetryUnavailable: false,
      };
      try {
        const detail = await getDriverHosDetail(driver.id, operatingCompanyId);
        const latestEvent = detail.timeline_24h[0];
        return {
          ...base,
          currentDutyStatus: latestEvent?.duty_status ?? null,
          driveRemainingMin: detail.clocks.drive_remaining_min,
          clockStatus: detail.clocks.status,
        };
      } catch {
        // SAFETY-F6458: a per-driver HOS outage is not the same thing as a driver
        // with no recorded duty status. Preserve the roster row, but mark the
        // telemetry unavailable so compliance KPIs cannot silently undercount.
        return { ...base, telemetryUnavailable: true };
      }
    })
  );
  return { rows, total, failedDriverCount: rows.filter((row) => row.telemetryUnavailable).length };
}

type Props = {
  operatingCompanyId: string;
};

export function HoursOfServicePage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [fleetSearch, setFleetSearch] = useState("");

  const fleetQuery = useQuery({
    queryKey: ["safety", "hos-dashboard", operatingCompanyId, fleetSearch],
    queryFn: () => loadFleetHosRows(operatingCompanyId, fleetSearch),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 30_000,
  });

  const violationsQuery = useQuery({
    queryKey: ["safety-v64", "hos-violations", operatingCompanyId, "dashboard"],
    queryFn: () => listHosViolations(operatingCompanyId, { limit: 12, offset: 0 }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = fleetQuery.isError ? [] : fleetQuery.data?.rows ?? [];
  const fleetTotal = fleetQuery.isError ? 0 : fleetQuery.data?.total;
  const failedDriverCount = fleetQuery.isError ? 0 : fleetQuery.data?.failedDriverCount ?? 0;
  const fleetIncomplete = failedDriverCount > 0;
  const metrics = useMemo(() => computeHosDashboardMetrics(rows), [rows]);
  const violations = (violationsQuery.isError ? [] : violationsQuery.data?.hos_violations ?? []).filter((row) => !row.voided_at);
  const violationTotal = violationsQuery.isError ? 0 : violationsQuery.data?.total_count ?? 0;

  const fleetColumns = useMemo<Array<ParityColumn<FleetHosDriverRow>>>(
    () => [
      {
        key: "driverName",
        label: "Driver",
        sortable: true,
        cellClass: "font-medium",
        // SAF-F14 / linkage: name-only text blocked drill-through to the driver record.
        render: (row) => <EntityLink kind="driver" id={row.driverId} label={entityLabel(row.driverName, row.driverId, "Driver")} />,
      },
      {
        key: "currentDutyStatus",
        label: "Duty",
        sortable: true,
        cellClass: "capitalize",
        render: (row) => row.telemetryUnavailable ? "Unavailable" : formatDutyStatus(row.currentDutyStatus),
      },
      { key: "driveRemainingMin", label: "Drive left", sortable: true, render: (row) => row.telemetryUnavailable ? "Unavailable" : formatDriveRemaining(row.driveRemainingMin) },
      { key: "clockStatus", label: "Clock", sortable: true, render: (row) => row.telemetryUnavailable ? "Unavailable" : row.clockStatus ?? "—" },
      {
        key: "action",
        label: "Action",
        render: (row) => (
          <Link to={`/drivers/${row.driverId}/hos`} className="font-semibold text-slate-700 hover:underline">
            Drill-down
          </Link>
        ),
      },
    ],
    [],
  );

  const driverNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.driverId, r.driverName);
    return m;
  }, [rows]);

  return (
    <div className="space-y-3" data-testid="safety-hos-dashboard-page">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Hours of Service — Compliance</div>
          <div className="text-[11px] text-slate-500">
            Fleet duty status and FMCSA clocks from recorded duty-status events. Driver self-view remains on Driver HOS detail.
          </div>
        </div>
        <button
          type="button"
          className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white"
          data-testid="safety-hos-create-violation"
          aria-label="Create HOS violation"
          onClick={() => setCreateOpen(true)}
        >
          + Create
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-3" data-testid="safety-hos-kpi-tiles">
        <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] uppercase text-slate-700">Drivers on duty</div>
          <div className="text-xl font-semibold text-emerald-900" data-testid="safety-hos-kpi-on-duty">
            {fleetQuery.isError || fleetIncomplete ? "—" : metrics.onDuty}
          </div>
        </div>
        <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] uppercase text-slate-700">Drivers off duty</div>
          <div className="text-xl font-semibold text-slate-900" data-testid="safety-hos-kpi-off-duty">
            {fleetQuery.isError || fleetIncomplete ? "—" : metrics.offDuty}
          </div>
        </div>
        <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] uppercase text-slate-700">Approaching 11h drive cap</div>
          <div className="text-xl font-semibold text-slate-700" data-testid="safety-hos-kpi-approaching-cap">
            {fleetQuery.isError || fleetIncomplete ? "—" : metrics.approachingCap}
          </div>
          <div className="text-[10px] text-slate-700">Within {NEAR_CAP_MINUTES} min of {ELEVEN_HOUR_CAP_MIN / 60}h limit</div>
        </div>
      </div>

      {!fleetQuery.isError && !fleetIncomplete && metrics.nearViolations.length > 0 ? (
        <section className="rounded-sm border border-slate-300 bg-slate-50 p-3" data-testid="safety-hos-near-violations">
          <h2 className="text-xs font-semibold uppercase text-slate-700">Near-violation alerts</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {metrics.nearViolations.map((row) => (
              <li key={row.driverId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {row.driverName} — {formatDriveRemaining(row.driveRemainingMin)} drive remaining (
                  {formatDutyStatus(row.currentDutyStatus)})
                </span>
                <Link
                  to={`/drivers/${row.driverId}/hos`}
                  className="font-semibold text-slate-700 underline"
                  data-testid={`safety-hos-drilldown-${row.driverId}`}
                >
                  View HOS
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <section>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-800">Fleet duty status</div>
            <input
              type="search"
              value={fleetSearch}
              onChange={(event) => setFleetSearch(event.target.value)}
              placeholder="Search drivers…"
              className="min-h-12 w-48 rounded-sm border border-gray-300 px-2 text-xs"
              data-testid="safety-hos-fleet-search"
            />
          </div>
          {!fleetQuery.isError && fleetIncomplete ? (
            <ListErrorState
              title="Some driver HOS clocks are unavailable"
              status={0}
              message={`${failedDriverCount} driver HOS ${failedDriverCount === 1 ? "record could" : "records could"} not be loaded. Dashboard totals are hidden until the complete fleet can be verified.`}
              onRetry={() => void fleetQuery.refetch()}
            />
          ) : null}
          {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed fleet-HOS query fell through to
              emptyText "No active drivers for this company." On an hours-of-service surface that
              reads as a clean fleet with nobody near a limit — an outage presenting as compliance. */}
          {fleetQuery.isError ? (
            <ListErrorState
              title="Couldn't load fleet HOS status"
              status={0}
              message={(fleetQuery.error as Error)?.message}
              onRetry={() => void fleetQuery.refetch()}
            />
          ) : (
          <ParityTable<FleetHosDriverRow>
            columns={fleetColumns}
            rows={rows}
            rowKey={(row) => row.driverId}
            loading={fleetQuery.isLoading}
            emptyText="No active drivers for this company."
            storageKey="safety-hos-fleet"
            exportFilename="hos-fleet-status"
            tableTestId="safety-hos-fleet-table"
            rowTestId={(row) => `safety-hos-row-${row.driverId}`}
            // SAF-F3486: server-bound fleetSearch input above — suppress ParityTable toolbar Search.
            suppressToolbarSearch
          />
          )}
          <CappedListNotice
            shown={rows.length}
            limit={200}
            total={fleetTotal}
            hint="Refine the search to see drivers beyond the first page."
            className="mt-1 text-xs text-slate-600"
          />
        </section>

        <section className="rounded-sm border border-gray-200 bg-white" data-testid="safety-hos-violations-panel">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <div className="text-xs font-semibold text-slate-800">HOS violations (read-only){violationTotal ? ` · ${violationTotal} total` : ""}</div>
            <Link to="/safety/hos-violations" className="text-[11px] font-semibold text-slate-700 hover:underline">
              Open violations tab
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {violationsQuery.isError ? (
              <ListErrorState
                title="Couldn't load HOS violations"
                status={0}
                message={(violationsQuery.error as Error)?.message}
                onRetry={() => void violationsQuery.refetch()}
              />
            ) : violations.length === 0 ? (
              <p className="text-xs text-slate-500">No open violations on file.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {violations.map((row) => (
                  <li key={String(row.id)} className="rounded-sm border border-gray-100 bg-gray-50 px-2 py-1">
                    <div className="font-semibold">{String(row.violation_type ?? "Violation")}</div>
                    <div className="text-slate-600">
                      Driver{" "}
                      <EntityLink
                        kind="driver"
                        id={row.driver_id ? String(row.driver_id) : undefined}
                        label={entityLabel(
                          (row.driver_name as string | undefined) ??
                            (row.driver_id ? driverNameById.get(String(row.driver_id)) : undefined),
                          row.driver_id ? String(row.driver_id) : null,
                          "Driver"
                        )}
                      />{" "}
                      · {formatDateUS(row.occurred_at) || String(row.occurred_at ?? "—")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-slate-500">
            Log new HOS violations with <span className="font-semibold text-slate-700">+ Create</span> above, or manage the full list on{" "}
            <Link to="/safety/hos-violations" className="font-semibold text-slate-700 hover:underline">
              /safety/hos-violations
            </Link>
            . Exception paperwork:{" "}
            <Link to="/safety/hos/exceptions" className="font-semibold text-slate-700 hover:underline">
              HOS exceptions
            </Link>
            .
          </div>
        </section>
      </div>

      <HosViolationCreateModal
        open={createOpen}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["safety-v64", "hos-violations"] });
        }}
      />
    </div>
  );
}
