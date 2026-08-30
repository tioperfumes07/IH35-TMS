#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["reverse_link"],"leaves":["card_overage"],"task":"FUEL-F5898-CARD-OVERAGE-REVERSE-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  routes: read("apps/backend/src/fuel/fuel-card-overage.routes.ts"),
  queue: read("apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx"),
  reverse: read("apps/frontend/src/components/fuel/FuelCardOverageReverseSection.tsx"),
  driver: read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
  unit: read("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"),
  matrix: read("docs/specs/scoreboard/modules/fuel.required.json"),
  feed: read("docs/specs/scoreboard/wire-sprint-built.json"),
  self: read("scripts/verify-fuel-card-overage-profile-reverse.mjs"),
};
const HEADER = '/** @matrix-built {"modules":["fuel"],"cols":["reverse_link"],"leaves":["card_overage"],"task":"FUEL-F5898-CARD-OVERAGE-REVERSE-EXACT","vertical":"class-sweep"} */';
function mutateCardLeaf(source, token, replacement) {
  const start = source.indexOf('"id": "card_overage"');
  const end = source.indexOf("\n    {", start);
  const block = source.slice(start, end < 0 ? source.length : end);
  return source.slice(0, start) + block.replace(token, replacement) + source.slice(end < 0 ? source.length : end);
}
function failures(s = files) { const found = [
  ["company-scoped driver/unit/event filters", s.routes.includes("driver_id: z.string().uuid().optional()") && s.routes.includes("e.driver_id = $${values.length}::uuid") && s.routes.includes("e.unit_id = $${values.length}::uuid") && s.routes.includes("e.id = $${values.length}::uuid")],
  ["profile-filtered canonical read", s.reverse.includes('listOverageEvents(operatingCompanyId, "all", filter)') && s.reverse.includes('queryKey: ["fuel-card-overage-reverse", operatingCompanyId, filter]')],
  ["driver and unit reverse mounts", s.driver.includes('filter={{ driver_id: id }}') && s.unit.includes('filter={{ unit_id: id }}')],
  ["exact event drill", s.reverse.includes('kind="fuel_card_overage_event"') && s.reverse.includes('id={event.id}') && s.queue.includes('searchParams.get("event_id")') && s.queue.includes("event_id: eventId")],
  ["queue preserves profile target", s.queue.includes('searchParams.get("driver_id")') && s.queue.includes('searchParams.get("unit_id")') && s.queue.includes("driver_id: effectiveDriverId") && s.queue.includes("unit_id: effectiveUnitId")],
  ["queue EntityPicker filters", s.queue.includes('dataTestId="fuel-card-overage-filter-driver"') && s.queue.includes('dataTestId="fuel-card-overage-filter-unit"') && s.queue.includes("allowCreate={false}")],
  ["optional filters omit undefined UUID query values", s.queue.includes("for (const [key, value] of Object.entries(filters))") && s.queue.includes("if (value) params.set(key, value)") && !s.queue.includes("...filters,")],
  ["reverse list cap is disclosed", s.reverse.includes("const visibleEvents = events.slice(0, 5)") && s.reverse.includes("const totalCount = query.isError ? 0 : (query.data?.total_count ?? events.length)") && s.reverse.includes("totalCount > visibleEvents.length") && s.reverse.includes("Showing {visibleEvents.length} of {totalCount}. Open queue to view all.")],
  ["reverse GET failure has exact retry", s.reverse.includes("Couldn't load fuel card overages") && s.reverse.includes("onRetry={() => void query.refetch()}")],
  ["reverse failure suppresses stale cached rows and count", s.reverse.includes("const events = query.isError ? [] : (query.data?.events ?? [])") && s.reverse.includes("const totalCount = query.isError ? 0 : (query.data?.total_count ?? events.length)")],
].filter(([, ok]) => !ok).map(([name]) => name);
  let matrix;
  try { matrix = JSON.parse(s.matrix); } catch (error) { found.push(`Fuel matrix parse: ${error.message}`); }
  const leaf = matrix?.leaves?.find((candidate) => candidate.id === "card_overage");
  if (!leaf?.required?.includes("reverse_link")) found.push("card_overage must require reverse_link");
  if (leaf?.route_hint !== "/fuel/card-overage") found.push("card_overage must name mounted route /fuel/card-overage");
  if (!s.self.split('import fs from "node:fs";')[0].includes(HEADER)) found.push("exact card_overage header missing");
  try { if (JSON.parse(s.feed).entries?.some((entry) => entry.guard === "scripts/verify-fuel-card-overage-profile-reverse.mjs")) found.push("manual feed duplicates exact ownership"); }
  catch (error) { found.push(`feed parse: ${error.message}`); }
  return found;
}
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, routes: files.routes.replace("e.driver_id = $${values.length}::uuid", "TRUE") }).includes("company-scoped driver/unit/event filters"),
    failures({ ...files, reverse: files.reverse.replace('listOverageEvents(operatingCompanyId, "all", filter)', 'listOverageEvents(operatingCompanyId, "all")') }).includes("profile-filtered canonical read"),
    failures({ ...files, unit: "" }).includes("driver and unit reverse mounts"),
    failures({ ...files, reverse: files.reverse.replace('kind="fuel_card_overage_event"', 'kind="unit"') }).includes("exact event drill"),
    failures({ ...files, queue: files.queue.replace('searchParams.get("unit_id")', 'searchParams.get("missing")') }).includes("queue preserves profile target"),
    failures({ ...files, queue: files.queue.replace('dataTestId="fuel-card-overage-filter-driver"', 'dataTestId="x"') }).includes("queue EntityPicker filters"),
    failures({ ...files, queue: files.queue.replace("if (value) params.set(key, value)", "params.set(key, String(value))") }).includes("optional filters omit undefined UUID query values"),
    failures({ ...files, reverse: files.reverse.replace("totalCount > visibleEvents.length", "false") }).includes("reverse list cap is disclosed"),
    failures({ ...files, reverse: files.reverse.replace("onRetry={() => void query.refetch()}", "onRetry={undefined}") }).includes("reverse GET failure has exact retry"),
    failures({ ...files, reverse: files.reverse.replace("Couldn't load fuel card overages", "Fuel card overages unavailable") }).includes("reverse GET failure has exact retry"),
    failures({ ...files, reverse: files.reverse.replace("query.isError ? []", "false ? []") }).includes("reverse failure suppresses stale cached rows and count"),
    failures({ ...files, matrix: mutateCardLeaf(files.matrix, '"id": "card_overage"', '"id": "card_overage.broken"') }).includes("card_overage must require reverse_link"),
    failures({ ...files, matrix: mutateCardLeaf(files.matrix, '"reverse_link"', '"reverse_link_broken"') }).includes("card_overage must require reverse_link"),
    failures({ ...files, matrix: mutateCardLeaf(files.matrix, '"route_hint": "/fuel/card-overage"', '"route_hint": "/broken"') }).includes("card_overage must name mounted route /fuel/card-overage"),
    failures({ ...files, self: files.self.replace(HEADER, HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')) }).includes("exact card_overage header missing"),
    failures({ ...files, feed: JSON.stringify({ entries: [{ guard: "scripts/verify-fuel-card-overage-profile-reverse.mjs" }] }) }).includes("manual feed duplicates exact ownership"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-fuel-card-overage-profile-reverse selftest FAIL — mutations ${checks.map((ok, i) => ok ? null : i + 1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-fuel-card-overage-profile-reverse selftest PASS — 16/16 runtime/evidence mutations red"); process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-fuel-card-overage-profile-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-fuel-card-overage-profile-reverse PASS — card overages return to exact driver/unit profiles and queue events");
