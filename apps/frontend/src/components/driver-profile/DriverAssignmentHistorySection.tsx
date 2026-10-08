/**
 * ORDERS DRIVER PROFILE — assignment history (unit at time).
 * GET /api/v1/drivers/:id/profile/assignments → telematics.vehicle_driver_assignments.
 */
import { useQuery } from "@tanstack/react-query";
import { getDriverProfileAssignments } from "../../api/driver-profile-tabs";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorState } from "../ListErrorState";

export function DriverAssignmentHistorySection({
  companyId,
  driverId,
}: {
  companyId: string;
  driverId: string;
}) {
  const q = useQuery({
    queryKey: ["driver-profile", "assignments", companyId, driverId],
    queryFn: () => getDriverProfileAssignments(companyId, driverId),
    enabled: Boolean(companyId && driverId),
  });
  const rows = q.isError ? [] : q.data?.assignments ?? [];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="dp-section-assignment-history" data-dp-assignments="1">
      <h2 className="mb-1 text-xs font-semibold text-[#0F1219]">Assignment history</h2>
      <p className="mb-2 text-xs text-[#4B5563]">Units this driver held (telematics assignment window — unit at time).</p>
      {q.isError ? (
        <ListErrorState title="Couldn't load assignment history" status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />
      ) : null}
      {q.isLoading ? <p className="text-xs text-[#6B7280]">Loading…</p> : null}
      {!q.isLoading && !q.isError && rows.length === 0 ? (
        <p className="text-xs text-[#6B7280]">No assignment history in the last 30 days.</p>
      ) : null}
      <ul className="divide-y divide-gray-100">
        {rows.slice(0, 40).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs text-[#1F2A44]">
            <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />
            <span className="text-[#6B7280]">
              {formatDateTimeUS(row.started_at)} → {row.ended_at ? formatDateTimeUS(row.ended_at) : "open"}
              {row.source ? ` · ${row.source}` : ""}
              {row.is_default ? " · default" : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
