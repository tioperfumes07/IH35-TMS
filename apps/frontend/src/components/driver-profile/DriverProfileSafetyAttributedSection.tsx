/**
 * ORDERS DRIVER PROFILE — safety: faults (at time) · harsh · DVIRs · DOT dwell.
 * GET /api/v1/drivers/:id/profile/safety
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDriverProfileSafety } from "../../api/driver-profile-tabs";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorState } from "../ListErrorState";

function Block({
  title,
  testId,
  empty,
  children,
}: {
  title: string;
  testId: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <h3 className="mb-1 text-xs font-semibold text-[#0F1219]">{title}</h3>
      {empty ? <p className="text-xs text-[#6B7280]">None in the last 30 days.</p> : children}
    </div>
  );
}

export function DriverProfileSafetyAttributedSection({
  companyId,
  driverId,
}: {
  companyId: string;
  driverId: string;
}) {
  const q = useQuery({
    queryKey: ["driver-profile", "safety", companyId, driverId],
    queryFn: () => getDriverProfileSafety(companyId, driverId),
    enabled: Boolean(companyId && driverId),
  });

  if (q.isError) {
    return (
      <ListErrorState
        title="Couldn't load attributed safety"
        status={0}
        message={(q.error as Error)?.message}
        onRetry={() => void q.refetch()}
      />
    );
  }
  if (q.isLoading || !q.data) {
    return <p className="text-xs text-[#6B7280]" data-testid="dp-section-safety-attributed-loading">Loading safety…</p>;
  }

  const { faults, harsh_events, dvirs, dot_inspections } = q.data;

  return (
    <div className="space-y-2" data-testid="dp-section-safety-attributed" data-dp-safety-attributed="1">
      <Block title="Engine faults (driver at fault time)" testId="dp-safety-faults" empty={faults.length === 0}>
        <ul className="divide-y divide-gray-100 text-xs text-[#1F2A44]">
          {faults.slice(0, 25).map((r) => (
            <li key={String(r.id)} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <EntityLinkOrTombstone kind="unit" id={r.unit_id == null ? null : String(r.unit_id)} name={r.unit_number} noun="Unit" />
                {" · "}
                {String(r.fault_code ?? "—")}
                {r.severity ? ` · ${String(r.severity)}` : ""}
              </span>
              <span className="text-[#6B7280]">{r.occurred_at ? formatDateTimeUS(String(r.occurred_at)) : "—"}</span>
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Harsh events" testId="dp-safety-harsh" empty={harsh_events.length === 0}>
        <ul className="divide-y divide-gray-100 text-xs text-[#1F2A44]">
          {harsh_events.slice(0, 25).map((r) => (
            <li key={String(r.id)} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                {String(r.event_kind ?? "harsh")}
                {r.severity ? ` · ${String(r.severity)}` : ""}
                {r.unit_number ? ` · ${String(r.unit_number)}` : ""}
              </span>
              <span className="text-[#6B7280]">{r.event_at ? formatDateTimeUS(String(r.event_at)) : "—"}</span>
            </li>
          ))}
        </ul>
      </Block>
      <Block title="DVIRs (signer)" testId="dp-safety-dvirs" empty={dvirs.length === 0}>
        <ul className="divide-y divide-gray-100 text-xs text-[#1F2A44]">
          {dvirs.slice(0, 25).map((r) => (
            <li key={String(r.id)} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <EntityLinkOrTombstone kind="unit" id={r.unit_id == null ? null : String(r.unit_id)} name={r.unit_number} noun="Unit" />
                {" · "}
                {String(r.type ?? "DVIR")}
                {r.has_major_defect ? " · major defect" : r.has_any_defect ? " · defect" : ""}
                {r.from_samsara ? " · Samsara" : ""}
              </span>
              <span className="text-[#6B7280]">{r.submitted_at ? formatDateTimeUS(String(r.submitted_at)) : "—"}</span>
            </li>
          ))}
        </ul>
      </Block>
      <Block title="DOT inspection dwell" testId="dp-safety-dot-dwell" empty={dot_inspections.length === 0}>
        <ul className="divide-y divide-gray-100 text-xs text-[#1F2A44]">
          {dot_inspections.slice(0, 25).map((r) => (
            <li key={String(r.id)} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                {r.station ? String(r.station) : "DOT station"}
                {r.dwell_minutes != null ? ` · ${String(r.dwell_minutes)} min` : ""}
                {r.follow_up_state ? ` · ${String(r.follow_up_state)}` : ""}
              </span>
              <span className="text-[#6B7280]">{r.arrived_at ? formatDateTimeUS(String(r.arrived_at)) : "—"}</span>
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
