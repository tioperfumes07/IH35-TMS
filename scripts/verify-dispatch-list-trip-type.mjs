#!/usr/bin/env node
/**
 * ROUND 20.1 MEASURED DEFECT B (Claude Lead, 2026-09-12): GET /api/v1/dispatch/loads (the LIST
 * route) never projected trip_type, even though the detail route (GET .../loads/:id) always has.
 * DispatchLoadRow.trip_type resolved undefined on every list row, resolvedTripType() fell back to
 * positional inference, and Round Trips tagged EVERY row NB. Live 16:35 CT: all 7 open-tour rows
 * rendered data-rt-sequence="NB" while 6 of the 7 linked legs were really SB.
 *
 * This guard asserts the list route's row-level SELECT (not the count-only SELECT) projects
 * trip_type from the already-joined `ml` (mdata.loads) alias, plus the two companion fields
 * (presettlement_link_id, tour_id) the linkage-orphan fix in the same PR depends on.
 *
 * Run: node scripts/verify-dispatch-list-trip-type.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-dispatch-list-trip-type";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const ROUTES_PATH = path.join(repoRoot, "apps/backend/src/dispatch/loads.routes.ts");
const FRONTEND_TYPE_PATH = path.join(repoRoot, "apps/frontend/src/api/loads.ts");

/**
 * Pure: extracts the row-level SELECT block for GET /api/v1/dispatch/loads -- the one that feeds
 * `rowsRes`, not the earlier `count(*)::int AS total` block -- and checks it projects the three
 * fields from the `ml` alias. Scoped narrowly (between the "l.*," row-select marker and the first
 * "FROM views.dispatch_load_with_driver_status l" that follows it) so this can't accidentally match
 * the detail route's OWN, already-correct projection further down the same file.
 */
export function auditDispatchListSelect(src) {
  const failures = [];
  const rowSelectStart = src.indexOf("l.*,");
  if (rowSelectStart === -1) {
    failures.push("could not find the list route's row-level SELECT (l.*, marker) at all -- guard needs updating, not silently passing");
    return failures;
  }
  const fromIdx = src.indexOf("FROM views.dispatch_load_with_driver_status l", rowSelectStart);
  if (fromIdx === -1) {
    failures.push("could not find the matching FROM views.dispatch_load_with_driver_status l after the row-select marker");
    return failures;
  }
  const block = src.slice(rowSelectStart, fromIdx);
  if (!/ml\.trip_type\s+AS\s+trip_type/.test(block)) {
    failures.push("the dispatch loads LIST route's row SELECT does not project ml.trip_type AS trip_type");
  }
  if (!/ml\.presettlement_link_id\s+AS\s+presettlement_link_id/.test(block)) {
    failures.push("the dispatch loads LIST route's row SELECT does not project ml.presettlement_link_id AS presettlement_link_id");
  }
  if (!/ml\.tour_id\s+AS\s+tour_id/.test(block)) {
    failures.push("the dispatch loads LIST route's row SELECT does not project ml.tour_id AS tour_id");
  }
  return failures;
}

export function auditFrontendType(src) {
  const failures = [];
  if (!/trip_type\?:\s*"NB"\s*\|\s*"TR"\s*\|\s*"SB"\s*\|\s*"LOCAL"\s*\|\s*null;/.test(src)) {
    failures.push("DispatchLoadRow no longer declares trip_type");
  }
  if (!/presettlement_link_id\?:\s*string\s*\|\s*null;/.test(src)) {
    failures.push("DispatchLoadRow does not declare presettlement_link_id");
  }
  if (!/tour_id\?:\s*string\s*\|\s*null;/.test(src)) {
    failures.push("DispatchLoadRow does not declare tour_id");
  }
  return failures;
}

function run() {
  const failures = [];
  const routesSrc = fs.existsSync(ROUTES_PATH) ? fs.readFileSync(ROUTES_PATH, "utf8") : null;
  if (!routesSrc) failures.push(`${path.relative(repoRoot, ROUTES_PATH)}: missing`);
  else failures.push(...auditDispatchListSelect(routesSrc));

  const typeSrc = fs.existsSync(FRONTEND_TYPE_PATH) ? fs.readFileSync(FRONTEND_TYPE_PATH, "utf8") : null;
  if (!typeSrc) failures.push(`${path.relative(repoRoot, FRONTEND_TYPE_PATH)}: missing`);
  else failures.push(...auditFrontendType(typeSrc));

  if (failures.length) {
    console.error(`${LABEL} FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK -- dispatch loads LIST route projects trip_type/presettlement_link_id/tour_id from mdata.loads; DispatchLoadRow declares all three`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };
  const routesSrc = fs.readFileSync(ROUTES_PATH, "utf8");
  const typeSrc = fs.readFileSync(FRONTEND_TYPE_PATH, "utf8");

  assert.ok(auditDispatchListSelect(routesSrc).length === 0, `the real, fixed routes file must pass: ${JSON.stringify(auditDispatchListSelect(routesSrc))}`);
  assert.ok(auditFrontendType(typeSrc).length === 0, `the real, fixed type file must pass: ${JSON.stringify(auditFrontendType(typeSrc))}`);

  // Plant the exact regression: strip the three ml.* projections from the LIST route's row SELECT
  // (but leave the detail route's own, further-down copy untouched -- proves the narrow scoping works).
  const regressed = routesSrc.replace(
    "            ml.trip_type AS trip_type,\n            ml.presettlement_link_id AS presettlement_link_id,\n            ml.tour_id AS tour_id\n          FROM views.dispatch_load_with_driver_status l",
    "          FROM views.dispatch_load_with_driver_status l"
  );
  assert.ok(regressed !== routesSrc, "selftest replace target string not found -- guard's own fixture is stale");
  const regressedFailures = auditDispatchListSelect(regressed);
  assert.ok(
    regressedFailures.length === 3 &&
      regressedFailures.some((f) => f.includes("trip_type")) &&
      regressedFailures.some((f) => f.includes("presettlement_link_id")) &&
      regressedFailures.some((f) => f.includes("tour_id")),
    `stripping the LIST route's three fields must be caught (all three, not fewer): ${JSON.stringify(regressedFailures)}`
  );
  // The detail route's OWN projection (further down the same file) must still be intact and must
  // not make the narrowly-scoped list-route check pass by accident.
  assert.ok(/ml\.trip_type AS trip_type/.test(regressed), "selftest fixture accidentally removed the detail route's own projection too -- scoping is too broad");

  // Missing-marker path must fail loud, not pass vacuously.
  assert.ok(
    auditDispatchListSelect("export function unrelated() { return null; }").length === 1,
    "a source file missing the l.*, marker entirely must fail loud, not pass vacuously"
  );

  const typeRegressed = typeSrc.replace('tour_id?: string | null;\n};', '};');
  assert.ok(typeRegressed !== typeSrc, "selftest type-fixture replace target not found -- stale");
  assert.ok(auditFrontendType(typeRegressed).length === 1, "removing tour_id from DispatchLoadRow must be caught");

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
