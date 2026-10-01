/**
 * Linkage law, REVERSE direction — one panel for "everything the Samsara / telematics engines recorded
 * about this load" and "… about this truck". Consumes GET /api/v1/loads/:id/telematics and
 * GET /api/v1/units/:id/telematics (read-only, entity-scoped; load ownership = the shared
 * loadAtTimeSql rule: NB owns the truck until its delivery, then the booked return).
 * Every entity cell is a drill-through link (load / unit / driver), never a raw id.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorState } from "../ListErrorState";
import type { ParityColumn } from "../parity/ParityTable";
import { col, num, yes, when, LOAD, UNIT, DRIVER, type Row, type Section } from "./telematicsColumns";
import { SectionTable } from "./TelematicsSectionTable";

type Payload = Record<string, Row[] | Row | null>;

const LOAD_SECTIONS: Section[] = [
  { key: "stops", title: "Stops", note: "Every stop the truck made while it owned this load, with odometer.", empty: "No stops recorded for this load.",
    columns: [col("started_at", "Stopped", when), col("dwell_minutes", "Dwell min"), UNIT, DRIVER, col("geofence_label", "Fence"), col("city", "City"), col("state", "State"), col("odometer_mi", "Odometer", num(1)), col("miles_since_previous_stop", "Miles since prior", num(1))] },
  { key: "driven_miles_segments", title: "Driven miles", note: "Real odometer miles per leg (E-05).", empty: "No driven-miles segments yet.",
    columns: [col("segment_kind", "Leg"), col("started_at", "Start", when), col("ended_at", "End", when), col("odometer_start_mi", "Odo start", num(1)), col("odometer_end_mi", "Odo end", num(1)), col("driven_miles", "Miles", num(1))] },
  { key: "arrivals", title: "Arrivals", note: "Samsara fence arrivals at this load's stops.", empty: "No fence arrivals at this load's stops.",
    columns: [col("triggered_at", "Arrived", when), col("departed_at", "Departed", when), UNIT, DRIVER, col("confirmed_at", "Driver confirmed", when)] },
  { key: "fence_transitions", title: "Fence state", note: "Geofence state changes attributed to this load.", empty: "No fence state changes.",
    columns: [col("transitioned_at", "When", when), col("label", "Fence"), col("location_kind", "Kind"), col("from_state", "From"), col("to_state", "To")] },
  { key: "border_crossings", title: "Border crossings", note: "From the bridge fences.", empty: "No border crossings.",
    columns: [col("entered_geofence_at", "Entered", when), col("exited_geofence_at", "Exited", when), col("crossing_point", "Bridge"), col("direction", "Direction"), DRIVER] },
  { key: "dvirs", title: "DVIRs", note: "Inspections submitted while the truck carried this load.", empty: "No DVIRs.",
    columns: [col("submitted_at", "Submitted", when), col("type", "Type"), UNIT, DRIVER, col("has_any_defect", "Defect", yes), col("has_major_defect", "Major", yes)] },
  { key: "detention", title: "Detention", note: "Detention clocks on this load's stops.", empty: "No detention.",
    columns: [col("started_at", "Started", when), col("stopped_at", "Stopped", when), col("status", "Status")] },
  { key: "fuel_fills", title: "Fuel", note: "Fuel purchases charged to this load.", empty: "No fuel on this load.",
    columns: [col("transaction_at", "When", when), col("fuel_type", "Fuel"), col("gallons", "Gallons", num(3)), { ...col("total_cost", "Cost", num(2)), kind: "money" } as ParityColumn<Row>, UNIT, col("location_city", "City"), col("location_state", "State")] },
  { key: "driver_prompts", title: "Driver prompts", note: "Automatic prompts sent in this load's chat.", empty: "No prompts sent.",
    columns: [col("server_ts", "Sent", when), col("msg_type", "Type"), col("body", "Message")] },
  { key: "samsara_route_progress", title: "Samsara route progress", note: "Per stop, read back from the Samsara route: state, ETA, actual times, live share link.", empty: "No Samsara route read back yet.",
    columns: [col("sequence_number", "Stop #"), col("state", "State"), col("eta", "ETA", when), col("actual_arrival_at", "Arrived", when), col("actual_departure_at", "Departed", when), UNIT, col("live_sharing_url", "Live link"), col("read_at", "Read", when)] },
  { key: "samsara_route_pushes", title: "Samsara route", note: "Each push of this load as a Samsara route.", empty: "Not pushed to Samsara.",
    columns: [col("started_at", "When", when), col("success", "OK", yes), col("outcome", "Outcome"), col("samsara_route_id", "Samsara route")] },
];

const UNIT_SECTIONS: Section[] = [
  { key: "stops", title: "Stops", note: "Stops over 3 minutes, with the load and driver the truck had at that moment.", empty: "No stops in this window.",
    columns: [col("started_at", "Stopped", when), col("dwell_minutes", "Dwell min"), LOAD, DRIVER, col("city", "City"), col("state", "State"), col("odometer_mi", "Odometer", num(1)), col("miles_since_previous_stop", "Miles since prior", num(1))] },
  { key: "fence_crossings", title: "Fence crossings", note: "Every fence entry/exit with the odometer at that moment.", empty: "No fence crossings in this window.",
    columns: [col("occurred_at", "When", when), col("label", "Fence"), col("geofence_kind", "Kind"), col("event_kind", "Event"), col("odometer_mi", "Odometer", num(1)), col("odometer_source", "Odometer source")] },
  { key: "engine_faults", title: "Engine faults", note: "Samsara fault codes (SPN / FMI).", empty: "No faults in this window.",
    columns: [col("occurred_at", "When", when), col("fault_code", "Code"), col("severity", "Severity"), col("resolved_at", "Resolved", when)] },
  { key: "harsh_events", title: "Harsh events", note: "Harsh braking / acceleration / turning.", empty: "No harsh events in this window.",
    columns: [col("event_at", "When", when), col("event_kind", "Event"), col("g_force", "G", num(2)), DRIVER] },
  { key: "dvirs", title: "DVIRs", note: "Inspections of this truck, as tractor or as trailer.", empty: "No DVIRs in this window.",
    columns: [col("submitted_at", "Submitted", when), col("type", "Type"), col("role", "As"), LOAD, DRIVER, col("has_major_defect", "Major", yes)] },
  { key: "fuel_fills", title: "Fuel", note: "Fuel purchases on this truck.", empty: "No fuel in this window.",
    columns: [col("transaction_at", "When", when), col("fuel_type", "Fuel"), col("gallons", "Gallons", num(3)), { ...col("total_cost", "Cost", num(2)), kind: "money" } as ParityColumn<Row>, LOAD] },
  { key: "samsara_route_progress", title: "Samsara routes", note: "Route stops this truck ran, read back from Samsara.", empty: "No Samsara route stops in this window.",
    columns: [col("read_at", "Read", when), LOAD, col("sequence_number", "Stop #"), col("state", "State"), col("eta", "ETA", when), col("actual_arrival_at", "Arrived", when), col("actual_departure_at", "Departed", when)] },
  { key: "odometer_anchors", title: "Odometer readings", note: "Odometer anchors (Samsara and hand-entered).", empty: "No odometer readings in this window.",
    columns: [col("read_at", "When", when), col("odometer_miles", "Odometer", num(1)), col("source", "Source")] },
];

export function TelematicsLinksPanel({
  kind,
  id,
  operatingCompanyId,
  days = 30,
}: {
  kind: "load" | "unit";
  id: string;
  operatingCompanyId: string;
  days?: number;
}) {
  const q = useQuery({
    queryKey: ["telematics-links", kind, id, operatingCompanyId, days],
    queryFn: () => {
      const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
      if (kind === "unit") qs.set("days", String(days));
      return apiRequest<Payload>(`/api/v1/${kind === "load" ? "loads" : "units"}/${encodeURIComponent(id)}/telematics?${qs.toString()}`);
    },
    enabled: Boolean(id && operatingCompanyId),
  });
  const sections = kind === "load" ? LOAD_SECTIONS : UNIT_SECTIONS;
  const head = useMemo(() => (q.data ? ((kind === "load" ? q.data.load : q.data.unit) as Row | null) : null), [q.data, kind]);

  return (
    <section className="space-y-3 rounded-sm border border-gray-200 bg-white p-4" data-testid={`telematics-links-${kind}`}>
      <h3 className="text-xs font-semibold text-gray-800">
        {kind === "load" ? "Telematics for this load" : `Telematics for this truck (last ${days} days)`}
      </h3>
      {kind === "unit" && head ? (
        <p className="text-xs text-slate-700" data-testid="telematics-links-unit-now">
          Now on load{" "}
          <EntityLinkOrTombstone kind="load" id={head.load_now as string | null} name={head.load_now_number} noun="Load" />
          {" · "}driver{" "}
          <EntityLinkOrTombstone kind="driver" id={head.driver_now as string | null} name={head.driver_now_label} noun="Driver" />
        </p>
      ) : null}
      {q.isError ? (
        <ListErrorState title="Couldn't load telematics" status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <p className="text-xs text-slate-600">Loading…</p>
      ) : (
        sections.map((s) => (
          <SectionTable key={s.key} ownerKey={`${kind}-${id}`} section={s} rows={(q.data?.[s.key] as Row[] | undefined) ?? []} />
        ))
      )}
    </section>
  );
}
