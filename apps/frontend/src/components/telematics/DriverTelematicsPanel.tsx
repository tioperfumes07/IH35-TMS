/**
 * Driver profile, reverse linkage — what the Samsara / telematics engines recorded for this driver.
 * Consumes GET /api/v1/drivers/:id/profile/{assignments|stops-miles|fuel|safety|samsara} (read-only,
 * entity-scoped, driver attributed at the time of each event via driverAtTimeSql). Two parts so each
 * sits in the tab it belongs to: "operations" (Loads tab) and "safety" (Safety tab).
 */
import { useQueries } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { ListErrorState } from "../ListErrorState";
import { col, num, UNIT, LOAD, when, yes, type Row, type Section } from "./telematicsColumns";
import { SectionTable } from "./TelematicsSectionTable";

type Part = "operations" | "safety";

const ENDPOINTS: Record<Part, string[]> = {
  operations: ["assignments", "stops-miles", "fuel", "samsara"],
  safety: ["safety"],
};

const SECTIONS: Record<Part, Array<Section & { from: string }>> = {
  operations: [
    { from: "assignments", key: "assignments", title: "Truck assignments", note: "Which truck this driver held, and when (Samsara + dispatch).", empty: "No truck assignments in the last 30 days.",
      columns: [col("started_at", "From", when), col("ended_at", "To", when), UNIT, col("source", "Source"), col("is_default", "Default", yes)] },
    { from: "stops-miles", key: "stops", title: "Stops + miles", note: "Stops while this driver held the truck, with the load the truck carried.", empty: "No stops in the last 30 days.",
      columns: [col("started_at", "Stopped", when), col("dwell_minutes", "Dwell min"), UNIT, LOAD, col("city", "City"), col("state", "State"), col("odometer_mi", "Odometer", num(1)), col("miles_since_previous_stop", "Miles since prior", num(1))] },
    { from: "fuel", key: "fills", title: "Fuel", note: "Fills on the truck this driver held at fill time.", empty: "No fuel in the last 30 days.",
      columns: [col("transaction_at", "When", when), col("fuel_type", "Fuel"), col("gallons", "Gallons", num(3)), col("total_cost", "Cost", num(2)), UNIT, LOAD, col("location_city", "City"), col("location_state", "State")] },
    { from: "fuel", key: "samsara_fuel_reports", title: "Samsara fuel burn (daily)", note: "Gallons the engine burned while this driver drove, per day (Samsara).", empty: "No Samsara fuel report in the last 30 days.",
      columns: [col("report_date", "Day"), col("fuel_burned_gal", "Burned gal", num(1)), col("distance_mi", "Miles", num(1)), col("efficiency_mpg", "MPG", num(2)), col("engine_idle_hours", "Idle h", num(1))] },
    { from: "samsara", key: "samsara_accounts", title: "Samsara accounts", note: "Samsara driver logins mapped to this driver.", empty: "No Samsara account mapped.",
      columns: [col("samsara_username", "Username"), col("samsara_driver_id", "Samsara id"), col("last_login_at", "Last login", when), col("is_active", "Active", yes)] },
  ],
  safety: [
    { from: "safety", key: "harsh_events", title: "Harsh events", note: "Samsara harsh events while driving.", empty: "No harsh events in the last 30 days.",
      columns: [col("event_at", "When", when), col("event_kind", "Event"), col("severity", "Severity"), col("speed_at_event_mph", "Speed mph", num(0)), col("g_force", "G", num(2)), UNIT, col("attribution_source", "Driver from")] },
    { from: "safety", key: "dvirs", title: "DVIRs", note: "Inspections this driver submitted.", empty: "No DVIRs in the last 30 days.",
      columns: [col("submitted_at", "Submitted", when), col("type", "Type"), UNIT, col("has_any_defect", "Defect", yes), col("has_major_defect", "Major", yes), col("from_samsara", "Samsara", yes)] },
    { from: "safety", key: "faults", title: "Engine faults", note: "Faults on the truck while this driver held it.", empty: "No faults in the last 30 days.",
      columns: [col("occurred_at", "When", when), col("fault_code", "Code"), col("severity", "Severity"), UNIT, col("attribution_source", "Driver from"), col("resolved_at", "Resolved", when)] },
    { from: "safety", key: "dot_inspections", title: "DOT station stops", note: "Weigh / inspection station visits from the station fences.", empty: "No station stops in the last 30 days.",
      columns: [col("arrived_at", "Arrived", when), col("departed_at", "Departed", when), col("station", "Station"), col("dwell_minutes", "Dwell min"), col("follow_up_state", "Follow-up")] },
  ],
};

export function DriverTelematicsPanel({ part, driverId, operatingCompanyId }: { part: Part; driverId: string; operatingCompanyId: string }) {
  const endpoints = ENDPOINTS[part];
  const results = useQueries({
    queries: endpoints.map((ep) => ({
      queryKey: ["driver-profile-telematics", ep, driverId, operatingCompanyId],
      queryFn: () =>
        apiRequest<Record<string, unknown>>(
          `/api/v1/drivers/${encodeURIComponent(driverId)}/profile/${ep}?${new URLSearchParams({ operating_company_id: operatingCompanyId }).toString()}`
        ),
      enabled: Boolean(driverId && operatingCompanyId),
    })),
  });
  const failed = results.find((r) => r.isError);
  return (
    <section className="space-y-3 rounded-sm border border-gray-200 bg-white p-4" data-testid={`driver-telematics-${part}`}>
      <h3 className="text-xs font-semibold text-gray-800">
        {part === "operations" ? "Trucks, stops, miles and fuel (Samsara, last 30 days)" : "Samsara safety (last 30 days)"}
      </h3>
      {failed ? (
        <ListErrorState title="Couldn't load driver telematics" status={0} message={(failed.error as Error)?.message} onRetry={() => results.forEach((r) => void r.refetch())} />
      ) : results.some((r) => r.isLoading) ? (
        <p className="text-xs text-slate-600">Loading…</p>
      ) : (
        SECTIONS[part].map((s) => {
          const data = results[endpoints.indexOf(s.from)]?.data;
          return <SectionTable key={s.key} ownerKey={`driver-${driverId}`} section={s} rows={((data?.[s.key] as Row[] | undefined) ?? [])} />;
        })
      )}
    </section>
  );
}
