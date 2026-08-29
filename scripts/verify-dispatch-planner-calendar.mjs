#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["planning.calendar"],"task":"DISP-F5847-PLANNER-CALENDAR-REVERSE-EXACT-LEAF"} */
/** Block B21-D4: Dispatch planner calendar week view with drag-drop reschedule + HOS overlay. */
import fs from "node:fs";

const files = {
  self: "scripts/verify-dispatch-planner-calendar.mjs",
  matrix: "docs/specs/scoreboard/modules/dispatch.required.json",
  page: "apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx",
  pageTest: "apps/frontend/src/pages/dispatch/__tests__/PlannerCalendarPage.test.tsx",
  routes: "apps/backend/src/dispatch/planner.routes.ts",
  service: "apps/backend/src/dispatch/planner.service.ts",
  routeTest: "apps/backend/src/dispatch/__tests__/planner.routes.test.ts",
  index: "apps/backend/src/index.ts",
  dispatchApi: "apps/frontend/src/api/dispatch.ts",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  sidebar: "apps/frontend/src/components/layout/sidebar-config.ts",
  archDesign: "docs/specs/IH35_ARCHITECTURAL_DESIGN.md",
};
const original = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const dispatchFlyout = (source) => source.split('case "dispatch"')[1]?.split("case ")[0] ?? "";
const has = (needle) => (source) => source.includes(needle);
const matches = (pattern) => (source) => pattern.test(source);
const remove = (needle) => (source) => source.replaceAll(needle, "__PLANTED_DISPATCH_PLANNER_DEFECT__");
const removeTests = (source) => source.replace(/\bit\(/g, "__PLANTED_TEST__(");
const removeRequired = (id, column) => (source) => {
  const matrix = JSON.parse(source);
  const leaf = matrix.leaves.find((candidate) => candidate.id === id);
  leaf.required = leaf.required.filter((candidate) => candidate !== column);
  return JSON.stringify(matrix);
};

const contracts = [
  ["planner calendar exact reverse Built ownership", "self", matches(/^\/\*\* @matrix-built \{"modules":\["dispatch"\],"cols":\["reverse_link"\],"leaves":\["planning\.calendar"\],"task":"DISP-F5847-PLANNER-CALENDAR-REVERSE-EXACT-LEAF"\} \*\/$/m), (source) => source.replace(/^\/\*\* @matrix-built .*$/m, "/** planted broad Built claim */")],
  ["planner calendar Required reverse ownership", "matrix", (source) => { try { return JSON.parse(source).leaves.find((leaf) => leaf.id === "planning.calendar")?.required?.includes("reverse_link"); } catch { return false; } }, removeRequired("planning.calendar", "reverse_link")],
  ["planner page identity", "page", has("dispatch-planner-calendar-page"), remove("dispatch-planner-calendar-page")],
  ["HOS overlay control", "page", has("HOS overlay"), remove("HOS overlay")],
  ["drag-drop reschedule", "page", has("DndContext"), remove("DndContext")],
  ["reschedule snapshots company scope", "page", matches(/const input = \{[^\n]*companyId, generation: actionGenerationRef\.current \}/), remove("generation: actionGenerationRef.current")],
  ["reschedule writer uses submitted company", "page", has("operating_company_id: input.companyId"), remove("operating_company_id: input.companyId")],
  ["reschedule stale completion suppressed", "page", matches(/await rescheduleM\.mutateAsync\(input\);\s*if \(input\.generation !== actionGenerationRef\.current\) return;/), remove("if (input.generation !== actionGenerationRef.current) return;")],
  ["reschedule invalidates submitted company", "page", has('["dispatch", "planner-week", input.companyId]'), remove('["dispatch", "planner-week", input.companyId]')],
  ["planner drag locks pending", "page", has("disabled={rescheduleM.isPending}"), remove("disabled={rescheduleM.isPending}")],
  ["planner page test floor", "pageTest", (source) => (source.match(/\bit\(/g) ?? []).length >= 5, removeTests],
  ["planner route test floor", "routeTest", (source) => (source.match(/\bit\(/g) ?? []).length >= 3, removeTests],
  ["planner week API route", "routes", has("/api/v1/dispatch/planner/week"), remove("/api/v1/dispatch/planner/week")],
  ["planner reschedule API route", "routes", has("/api/v1/dispatch/planner/loads/:id/start_at"), remove("/api/v1/dispatch/planner/loads/:id/start_at")],
  ["planner conflict detection", "service", has("detectPlannerConflict"), remove("detectPlannerConflict")],
  ["planner HOS blackout read", "service", has("hos.duty_status_events"), remove("hos.duty_status_events")],
  ["planner customer FK projection", "service", has("l.customer_id::text AS customer_id"), remove("l.customer_id::text AS customer_id")],
  ["planner unit FK projection", "service", has("l.assigned_unit_id::text AS unit_id"), remove("l.assigned_unit_id::text AS unit_id")],
  ["planner roster admits authorized shared drivers", "service", matches(/FROM mdata\.driver_company_authorizations planner_roster_dca[\s\S]*?planner_roster_dca\.driver_id = d\.id[\s\S]*?planner_roster_dca\.company_id = \$1::uuid[\s\S]*?planner_roster_dca\.is_authorized = true[\s\S]*?planner_roster_dca\.deactivated_at IS NULL/), remove("FROM mdata.driver_company_authorizations planner_roster_dca")],
  ["planner initial and refreshed schedule use active stops", "service", (source) => (source.match(/stop_type = 'pickup' AND soft_deleted_at IS NULL/g) ?? []).length >= 2 && (source.match(/stop_type = 'delivery' AND soft_deleted_at IS NULL/g) ?? []).length >= 2, (source) => source.replaceAll(" AND soft_deleted_at IS NULL", "")],
  ["planner conflict scan uses active pickup stops", "service", matches(/const peerRes = await client\.query\([\s\S]*?FROM mdata\.load_stops[\s\S]*?WHERE load_id = l\.id[\s\S]*?stop_type = 'pickup'[\s\S]*?soft_deleted_at IS NULL[\s\S]*?ORDER BY sequence_number ASC[\s\S]*?\[operatingCompanyId, effectiveDriverId, weekStartIso, weekEndIso\]/), (source) => source.replace(/(const peerRes = await client\.query\([\s\S]*?stop_type = 'pickup'\s*)AND soft_deleted_at IS NULL/, "$1")],
  ["planner customer joins preserve canonical loads", "service", (source) => (source.match(/LEFT JOIN mdata\.customers c ON c\.id = l\.customer_id/g) ?? []).length === 3 && !source.includes("FOR UPDATE OF l, c"), (source) => source.replaceAll("LEFT JOIN mdata.customers c", "JOIN mdata.customers c")],
  ["planner historical customer labels cover every reader", "service", (source) => (source.match(/COALESCE\(c\.customer_name, mdata\.resolve_customer_label_same_company\(l\.customer_id, l\.operating_company_id\)\) AS customer_name/g) ?? []).length === 3, (source) => source.replaceAll("mdata.resolve_customer_label_same_company(l.customer_id, l.operating_company_id)", "NULL")],
  ["planner customer drill or tombstone", "page", matches(/<EntityLinkOrTombstone kind="customer" id=\{load\.customer_id\} name=\{load\.customer_name\} noun="Customer"/), remove('<EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer"')],
  ["planner driver drill", "page", matches(/<EntityLink kind="driver" id=\{driver\.id\}/), remove('<EntityLink kind="driver" id={driver.id}')],
  ["planner unit drill or tombstone", "page", matches(/<EntityLinkOrTombstone kind="unit" id=\{driver\.unit_id \?\? null\} name=\{driver\.unit_number\} noun="Unit"/), remove('<EntityLinkOrTombstone kind="unit" id={driver.unit_id ?? null} name={driver.unit_number} noun="Unit"')],
  ["backend planner registration", "index", has("registerDispatchPlannerRoutes"), remove("registerDispatchPlannerRoutes")],
  ["planner week frontend API", "dispatchApi", has("getDispatchPlannerWeek"), remove("getDispatchPlannerWeek")],
  ["planner reschedule frontend API", "dispatchApi", has("patchDispatchPlannerLoadStartAt"), remove("patchDispatchPlannerLoadStartAt")],
  ["planner mounted manifest route", "manifest", has('path="/dispatch/planner"'), remove('path="/dispatch/planner"')],
  ["planner Dispatch flyout link", "sidebar", (source) => dispatchFlyout(source).includes("/dispatch/planner"), remove("/dispatch/planner")],
  ["planner architecture registration", "archDesign", has("verify:dispatch-planner-calendar"), remove("verify:dispatch-planner-calendar")],
];

function audit(sources) {
  return contracts.filter(([, key, test]) => !test(sources[key])).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`verify:dispatch-planner-calendar FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, , mutate] of contracts) {
    const mutated = { ...original, [key]: mutate(original[key]) };
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`verify:dispatch-planner-calendar SELFTEST PASS — ${caught}/${contracts.length} exact planner mutations detected`);
  process.exit(0);
}

console.log("verify:dispatch-planner-calendar PASS");
