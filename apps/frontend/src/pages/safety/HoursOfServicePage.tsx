import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getDriverHosDetail } from "../../api/hos";
import { listDrivers } from "../../api/mdata";
import { listHosViolations } from "../../api/safetyV64";

const ON_DUTY_STATUSES = new Set(["driving", "on_duty_not_driving", "yard_moves"]);
const NEAR_CAP_MINUTES = 30;
const ELEVEN_HOUR_CAP_MIN = 11 * 60;

export type FleetHosDriverRow = {
  driverId: string;
  driverName: string;
  currentDutyStatus: string | null;
  driveRemainingMin: number | null;
  clockStatus: "ok" | "warning_1hr" | "warning_15min" | "violation" | null;
};

function driverDisplayName(driver: { id: string; first_name?: string | null; last_name?: string | null }) {
  const name = `${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim();
  return name || driver.id;
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

async function loadFleetHosRows(operatingCompanyId: string): Promise<FleetHosDriverRow[]> {
  const { drivers } = await listDrivers({ operating_company_id: operatingCompanyId, status: "Active" });
  return Promise.all(
    drivers.map(async (driver) => {
      const base: FleetHosDriverRow = {
        driverId: driver.id,
        driverName: driverDisplayName(driver),
        currentDutyStatus: null,
        driveRemainingMin: null,
        clockStatus: null,
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
        return base;
      }
    })
  );
}

type Props = {
  operatingCompanyId: string;
};

export function HoursOfServicePage({ operatingCompanyId }: Props) {
  const fleetQuery = useQuery({
    queryKey: ["safety", "hos-dashboard", operatingCompanyId],
    queryFn: () => loadFleetHosRows(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 30_000,
  });

  const violationsQuery = useQuery({
    queryKey: ["safety-v64", "hos-violations", operatingCompanyId, "dashboard"],
    queryFn: () => listHosViolations(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = fleetQuery.data ?? [];
  const metrics = useMemo(() => computeHosDashboardMetrics(rows), [rows]);
  const violations = (violationsQuery.data?.hos_violations ?? []).filter((row) => !row.voided_at);

  return (
    <div className="space-y-3" data-testid="safety-hos-dashboard-page">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Hours of Service — Compliance</div>
          <div className="text-[11px] text-slate-500">
            Fleet duty status and FMCSA clocks from <code className="text-[10px]">hos.duty_status_events</code> (CAP-11).
            Driver self-view remains on Driver HOS detail.
          </div>
        </div>
        <Link
          to="/safety/hos-violations"
          className="rounded bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white"
          data-testid="safety-hos-create-violation-link"
        >
          + Create violation
        </Link>
      </div>

      <div className="grid gap-2 md:grid-cols-3" data-testid="safety-hos-kpi-tiles">
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-[10px] uppercase text-emerald-800">Drivers on duty</div>
          <div className="text-xl font-semibold text-emerald-900" data-testid="safety-hos-kpi-on-duty">
            {metrics.onDuty}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] uppercase text-slate-700">Drivers off duty</div>
          <div className="text-xl font-semibold text-slate-900" data-testid="safety-hos-kpi-off-duty">
            {metrics.offDuty}
          </div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-[10px] uppercase text-amber-800">Approaching 11h drive cap</div>
          <div className="text-xl font-semibold text-amber-900" data-testid="safety-hos-kpi-approaching-cap">
            {metrics.approachingCap}
          </div>
          <div className="text-[10px] text-amber-700">Within {NEAR_CAP_MINUTES} min of {ELEVEN_HOUR_CAP_MIN / 60}h limit</div>
        </div>
      </div>

      {metrics.nearViolations.length > 0 ? (
        <section className="rounded border border-amber-300 bg-amber-50 p-3" data-testid="safety-hos-near-violations">
          <h2 className="text-xs font-semibold uppercase text-amber-900">Near-violation alerts</h2>
          <ul className="mt-2 space-y-1 text-xs text-amber-950">
            {metrics.nearViolations.map((row) => (
              <li key={row.driverId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {row.driverName} — {formatDriveRemaining(row.driveRemainingMin)} drive remaining (
                  {formatDutyStatus(row.currentDutyStatus)})
                </span>
                <Link
                  to={`/drivers/${row.driverId}/hos`}
                  className="font-semibold text-amber-900 underline"
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
        <section className="overflow-x-auto rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-slate-800">Fleet duty status</div>
          <table className="min-w-full text-xs" data-testid="safety-hos-fleet-table">
            <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
              <tr>
                <th className="px-2 py-1 text-left">Driver</th>
                <th className="px-2 py-1 text-left">Duty</th>
                <th className="px-2 py-1 text-left">Drive left</th>
                <th className="px-2 py-1 text-left">Clock</th>
                <th className="px-2 py-1 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.driverId} className="border-t border-gray-100" data-testid={`safety-hos-row-${row.driverId}`}>
                  <td className="px-2 py-1 font-medium">{row.driverName}</td>
                  <td className="px-2 py-1 capitalize">{formatDutyStatus(row.currentDutyStatus)}</td>
                  <td className="px-2 py-1">{formatDriveRemaining(row.driveRemainingMin)}</td>
                  <td className="px-2 py-1">{row.clockStatus ?? "—"}</td>
                  <td className="px-2 py-1">
                    <Link to={`/drivers/${row.driverId}/hos`} className="font-semibold text-slate-700 hover:underline">
                      Drill-down
                    </Link>
                  </td>
                </tr>
              ))}
              {!fleetQuery.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                    No active drivers for this company.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="rounded border border-gray-200 bg-white" data-testid="safety-hos-violations-panel">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <div className="text-xs font-semibold text-slate-800">HOS violations (read-only)</div>
            <Link to="/safety/hos-violations" className="text-[11px] font-semibold text-slate-700 hover:underline">
              Open violations tab
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {violations.length === 0 ? (
              <p className="text-xs text-slate-500">No open violations on file.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {violations.slice(0, 12).map((row) => (
                  <li key={String(row.id)} className="rounded border border-gray-100 bg-gray-50 px-2 py-1">
                    <div className="font-semibold">{String(row.violation_code ?? "Violation")}</div>
                    <div className="text-slate-600">
                      Driver {String(row.driver_id ?? "—")} · {String(row.occurred_at ?? "—")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-slate-500">
            Log new violations on{" "}
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
    </div>
  );
}
