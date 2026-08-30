import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { driverSchedulerOfficeApi } from "../../api/driver-scheduler";
import { formatDateUS } from "../../lib/formatDate";

export function DriverTempCoverReverseSection({ operatingCompanyId, driverId }: { operatingCompanyId: string; driverId: string }) {
  const query = useQuery({
    queryKey: ["safety", "reverse", "temp-cover", operatingCompanyId, driverId],
    queryFn: () => driverSchedulerOfficeApi.listTempAssignments(operatingCompanyId, { driver_id: driverId }),
    enabled: Boolean(operatingCompanyId && driverId),
  });
  const rows = query.isError ? [] : query.data?.assignments ?? [];
  const leaveQuery = useQuery({
    queryKey: ["safety", "reverse", "leave-requests", operatingCompanyId, driverId],
    queryFn: () => driverSchedulerOfficeApi.listDriverRequests(operatingCompanyId, driverId),
    enabled: Boolean(operatingCompanyId && driverId),
  });
  const leaveRows = leaveQuery.isError ? [] : leaveQuery.data?.requests ?? [];
  return <section className="space-y-4 rounded-sm border border-gray-200 bg-white p-3" data-testid="driver-temp-cover-reverse">
    <div className="space-y-2" data-testid="driver-leave-requests-reverse">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Leave Requests{leaveRows.length ? ` (${leaveRows.length})` : ""}</h3>
        <EntityLink kind="driver_scheduler_driver" id={driverId} label="Open Driver Scheduler" className="text-xs font-semibold text-slate-700 underline" />
      </div>
      {leaveQuery.isLoading ? <p className="text-sm text-gray-500">Loading leave requests…</p> : null}
      {leaveQuery.isError ? <ListErrorState status={0} message="Could not load leave requests for this driver." onRetry={() => void leaveQuery.refetch()} /> : null}
      {!leaveQuery.isLoading && !leaveQuery.isError && leaveRows.length === 0 ? <p className="text-sm text-gray-500">No leave requests are linked to this driver.</p> : null}
      {leaveRows.length ? <ul className="space-y-2">{leaveRows.map((raw) => {
        const row = raw as Record<string, unknown>;
        const requestId = String(row.id ?? "");
        const requestNumber = String(row.request_number ?? "Leave request");
        return <li key={requestId} className="rounded-sm border border-gray-200 p-2 text-xs text-slate-700">
          <EntityLink kind="scheduler_request" id={requestId || null} label={requestNumber} className="font-semibold text-slate-700 underline" />
          <span> · {String(row.leave_type ?? "Leave")} · {String(row.status ?? "Status unavailable")}</span>
          <div className="text-gray-500">{formatDateUS(String(row.start_date ?? ""))} – {formatDateUS(String(row.end_date ?? ""))}</div>
        </li>;
      })}</ul> : null}
    </div>
    <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-900">Temporary Cover Assignments{rows.length ? ` (${rows.length})` : ""}</h3>
    </div>
    {query.isLoading ? <p className="text-sm text-gray-500">Loading temporary assignments…</p> : null}
    {query.isError ? <ListErrorState status={0} message="Could not load temporary assignments for this driver." onRetry={() => void query.refetch()} /> : null}
    {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No active temporary assignments are linked to this driver.</p> : null}
    {rows.length ? <ul className="space-y-2">{rows.map((row) => <li key={row.id} className="rounded-sm border border-gray-200 p-2 text-xs text-slate-700">
      <span className="font-semibold">{row.primary_driver_id === driverId ? "Primary driver" : "Cover driver"}</span>
      <span> · Unit <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" /></span>
      <div className="text-gray-500">{formatDateUS(row.start_date)} – {formatDateUS(row.end_date)}</div>
    </li>)}</ul> : null}
    </div>
  </section>;
}
