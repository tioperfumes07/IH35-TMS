#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["reverse_link"],"leafRe":"^card_overage$","task":"VERTICAL-REVERSE-LINK-FUEL-CARD-OVERAGE"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  routes: read("apps/backend/src/fuel/fuel-card-overage.routes.ts"),
  queue: read("apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx"),
  reverse: read("apps/frontend/src/components/fuel/FuelCardOverageReverseSection.tsx"),
  driver: read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
  unit: read("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"),
};
function failures(s = files) { return [
  ["company-scoped driver/unit/event filters", s.routes.includes("driver_id: z.string().uuid().optional()") && s.routes.includes("e.driver_id = $${values.length}::uuid") && s.routes.includes("e.unit_id = $${values.length}::uuid") && s.routes.includes("e.id = $${values.length}::uuid")],
  ["profile-filtered canonical read", s.reverse.includes('listOverageEvents(operatingCompanyId, "all", filter)') && s.reverse.includes('queryKey: ["fuel-card-overage-reverse", operatingCompanyId, filter]')],
  ["driver and unit reverse mounts", s.driver.includes('filter={{ driver_id: id }}') && s.unit.includes('filter={{ unit_id: id }}')],
  ["exact event drill", s.reverse.includes('kind="fuel_card_overage_event"') && s.reverse.includes('id={event.id}') && s.queue.includes('searchParams.get("event_id")') && s.queue.includes("event_id: eventId")],
  ["queue preserves profile target", s.queue.includes('searchParams.get("driver_id")') && s.queue.includes('searchParams.get("unit_id")') && s.queue.includes("driver_id: driverId") && s.queue.includes("unit_id: unitId")],
].filter(([, ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, routes: files.routes.replace("e.driver_id = $${values.length}::uuid", "TRUE") }).includes("company-scoped driver/unit/event filters"),
    failures({ ...files, reverse: files.reverse.replace('listOverageEvents(operatingCompanyId, "all", filter)', 'listOverageEvents(operatingCompanyId, "all")') }).includes("profile-filtered canonical read"),
    failures({ ...files, unit: "" }).includes("driver and unit reverse mounts"),
    failures({ ...files, reverse: files.reverse.replace('kind="fuel_card_overage_event"', 'kind="unit"') }).includes("exact event drill"),
    failures({ ...files, queue: files.queue.replace('searchParams.get("unit_id")', 'searchParams.get("missing")') }).includes("queue preserves profile target"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-fuel-card-overage-profile-reverse selftest FAIL — mutations ${checks.map((ok, i) => ok ? null : i + 1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-fuel-card-overage-profile-reverse selftest PASS — 5/5 filter/profile/target mutations red"); process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-fuel-card-overage-profile-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-fuel-card-overage-profile-reverse PASS — card overages return to exact driver/unit profiles and queue events");
