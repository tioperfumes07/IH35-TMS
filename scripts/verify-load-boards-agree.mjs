#!/usr/bin/env node
// ROUND 177 JOB 1 + ROUND 285.4.2, UPDATED TRUCKLINE-16 (Lead, 2026-09-30): two deliberately
// different, permanent canonical sets now exist (canonical-active-load-set.ts's own file-header
// section "TWO CANONICAL QUESTIONS, NOT ONE"). Load Costs answers the ACCOUNTING question (money-
// aware, canonicalActiveLoadWhereClause) and must keep disagreeing with the others whenever money
// has finished a board-active load — that disagreement is correct, not drift. Dispatch List,
// Kanban, Round Trips, Trip Pairing and Truck Line all answer the DISPATCH WORK question ("is a
// unit carrying this load right now," canonicalDispatchWorkWhereClause) and must all agree with
// EACH OTHER, never with the money-aware set.
import { register } from "tsx/esm/api";
import { createRequire } from "node:module";
// 443.99: TLS by host (localhost / CI postgres service = off, Neon = on) — a hard-coded ssl option cannot connect to CI's local postgres.
const { inferPgSslOption } = createRequire(import.meta.url)("./lib/pg-connection-options.cjs");

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
register();

const LABEL = "verify-load-boards-agree";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function loadFragments() {
  const {
    canonicalActiveLoadWhereClause,
    canonicalActiveLoadNotFinishedByMoneyCte,
    canonicalLoadCostsOpenClause,
    canonicalDispatchWorkStatusClause,
  } = await import("../apps/backend/src/dispatch/canonical-active-load-set.ts");
  const { currentTruckLineLoadSql } = await import("../apps/backend/src/dispatch/current-truck-line-load.ts");
  const { UNIT_IN_SERVICE_SQL } = await import("../apps/backend/src/dispatch/truck-line/truck-line.routes.ts");
  return {
    canonicalActiveLoadWhereClause,
    canonicalActiveLoadNotFinishedByMoneyCte,
    canonicalLoadCostsOpenClause,
    canonicalDispatchWorkStatusClause,
    currentTruckLineLoadSql,
    UNIT_IN_SERVICE_SQL,
  };
}


// LEAD 443.206 (owner 10-21 "check all loadboards, they are not in sync"): the live half above compared HAND-COPIED SQL, so a
// board drifting in its own file was never seen. STATIC: every board file reads THE board set / THE unit gate and none of
// the private sets it used to (views.live_loads open_dispatch, a private unit gate, a capped status list).
import { readFileSync } from "node:fs";
export const BOARD_FILES = {
  list: "apps/backend/src/mdata/loads.routes.ts",
  dispatchLoads: "apps/backend/src/dispatch/loads.routes.ts",
  truckLine: "apps/backend/src/dispatch/truck-line/truck-line.routes.ts",
  tripPairing: "apps/backend/src/dispatch/trip-pairing-board.service.ts",
  planner: "apps/backend/src/dispatch/planner.service.ts",
  overview: "apps/backend/src/dispatch/active-loads-count.ts",
  canonical: "apps/backend/src/dispatch/canonical-active-load-set.ts",
  scenarios: "apps/backend/src/home/scenario-registry.ts",
  service: "apps/backend/src/dispatch/load-service.ts",
  unitAgg: "apps/backend/src/mdata/unit-aggregate.service.ts",
  trailerAgg: "apps/backend/src/mdata/equipment-aggregate.service.ts",
  driverAgg: "apps/backend/src/mdata/driver-aggregate.service.ts",
  liveMap: "apps/backend/src/integrations/samsara/positions/live-position.service.ts",
  driverHub: "apps/backend/src/mdata/canonical/driver-hub.service.ts",
  homeWidgets: "apps/backend/src/home/home-widgets.routes.ts",
  dispatcherHome: "apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts",
  // LEAD 443.235 / B9 — sidebar draft badge uses this list; must match isDraftLoad.
  drafts: "apps/backend/src/dispatch/quick-assign.service.ts",
  // LEAD 443.249 — the Truck / Driver / Loads / Timeline planners (FE hook) and the load list reader they call.
  plannerBars: "apps/frontend/src/pages/dispatch/planners/planner-bars.ts",
  mdataLoads: "apps/backend/src/mdata/loads.routes.ts",
  driverGrid: "apps/frontend/src/pages/dispatch/planners/SafetyDriverSchedulerGrid.tsx",
};
export function staticFailures(src) {
  const f = [];
  const need = (k, re, msg) => { if (!re.test(src[k])) f.push(`${BOARD_FILES[k]}: ${msg}`); };
  const ban = (k, re, msg) => { if (re.test(src[k])) f.push(`${BOARD_FILES[k]}: ${msg}`); };
  // 443.206R — THE board set reads views.live_loads through the load service (owner law 09-28).
  need("canonical", /\$\{canonicalDispatchWorkStatusClause\(alias\)\} AND \$\{alias\}\.operating_company_id = \$\{operatingCompanyIdParam\}\s*AND \$\{loadServiceMembershipSql\(alias, "open_dispatch", operatingCompanyIdParam\)\}/, "the board set must be the load service's open_dispatch state (views.live_loads), not a status list on mdata.loads");
  need("canonical", /export function canonicalBoardRowClause\(alias: string\): string \{\s*return loadServiceMembershipSql\(alias, "open_dispatch"\);/, "the entity-scoped board clause must be the load service");
  need("service", /FROM views\.live_loads v WHERE true/, "the load service reads views.live_loads");
  need("canonical", /COALESCE\(\$\{unitAlias\}\.currently_leased_to_company_id, \$\{unitAlias\}\.owner_company_id\) = \$\{operatingCompanyIdParam\}/, "THE unit gate is COALESCE(leased, owner) = company");
  need("list", /const existsSql = `\$\{canonicalDispatchWorkStatusClause\("l"\)\} AND \$\{canonicalBoardRowClause\("l"\)\}`/, "List / Kanban live scope = board status + row clause");
  need("dispatchLoads", /filters\.push\(`\$\{canonicalDispatchWorkStatusClause\("l"\)\} AND \$\{loadServiceMembershipSql\("l", "open_dispatch", "\$1::uuid"\)\}`\)/, "GET /dispatch/loads default = the load service's board (D13)");
  need("dispatchLoads", /scope: z\.enum\(\["board", "all"\]\)\.optional\(\)\.default\("board"\)/, "GET /dispatch/loads: scope=all is the explicit history read (D13)");
  need("dispatchLoads", /canonicalRealLoadRowClause\("bl"\)/, "GET /dispatch/loads scope=all never returns a voided / sample load (D13)");
  ban("dispatchLoads", /assigned_primary_driver_name: driverLabel/, "GET /dispatch/loads overwrites the full driver name with the short label (C1)");
  for (const k of ["unitAgg", "trailerAgg", "driverAgg", "liveMap", "driverHub", "homeWidgets", "dispatcherHome"])
    need(k, /\$\{loadServiceMembershipSql\(/, "reads its loads through the load service (443.206R item 1)");
  // LEAD 443.235 — Live Map must emit driver_uuid (harness / MapView) equal to the load-service driver_id.
  need("liveMap", /driver_uuid:\s*driverId/, "Live Map rows must emit driver_uuid (same value as driver_id from the load service)");
  need("liveMap", /loadServiceDriverNameSql\(/, "Live Map driver name comes from the load service helper");
  // LEAD 443.235 / B9 — sidebar listQuicksaveDrafts = status draft OR is_quicksave_draft (same as isDraftLoad).
  need("drafts", /status = 'draft' OR is_quicksave_draft = true/, "sidebar drafts must use ONE draft definition (isDraftLoad)");
  ban("drafts", /AND is_quicksave_draft = true\s*\n\s*AND soft_deleted_at/, "sidebar drafts back to quicksave-only (B9 second definition)");
  for (const k of ["unitAgg", "trailerAgg", "driverAgg"])
    ban(k, /NOT IN \('delivered', 'cancelled', 'void'/, "private current-load status list (register B5)");
  need("dispatchLoads", /AND \$\{canonicalDispatchWorkWhereClause\("l", "\$1::uuid"\)\}\s*-- LEAD 443\.231b/, "units-without-load: occupied = the board set (D6)");
  // 443.231b — Truck Line AVAILABLE and Unassigned units share UNIT_IN_SERVICE_SQL + unitCurrentDriverSql.
  need("dispatchLoads", /WHERE \$\{UNIT_IN_SERVICE_SQL\}/, "units-without-load uses UNIT_IN_SERVICE_SQL (same free-unit set as Truck Line AVAILABLE)");
  need("dispatchLoads", /\$\{unitCurrentDriverSql\("u", "\$1::uuid"\)\}/, "units-without-load uses unitCurrentDriverSql (443.231b)");
  need("truckLine", /\$\{unitCurrentDriverSql\("u", "\$1::uuid"\)\}/, "Truck Line AVAILABLE uses unitCurrentDriverSql (443.231b)");
  need("truckLine", /FROM mdata\.units u/, "Truck Line AVAILABLE is unit-centric (443.231b — one row per truck)");
  need("truckLine", /truck_line_available_duplicate_unit/, "Truck Line AVAILABLE fail-closed on duplicate unit_id (443.231b)");
  ban("truckLine", /FROM qualifying q/, "Truck Line AVAILABLE back on driver-centric qualifying CTE (443.231b)");
  ban("dispatchLoads", /FROM views\.live_loads\s+WHERE operating_company_id = \$1::uuid\s+AND live_state = 'open_dispatch'/, "a board tile reads views.live_loads open_dispatch (D2)");
  need("truckLine", /UNIT_IN_SERVICE_SQL/, "Truck Line AVAILABLE uses UNIT_IN_SERVICE_SQL (D3 / 443.231b)");
  ban("truckLine", /AND \$\{CURRENT_TRUCK_LINE_LOAD_SQL\.replace\([^)]*\)\}\s*AND \$\{UNIT_IN_SERVICE_SQL\}/, "Truck Line gates LOAD membership on its unit (D3)");
  need("tripPairing", /WHERE \$\{canonicalBoardUnitGateSql\("u", "\$1::uuid"\)\}/, "Trip Pairing uses THE unit gate (D4)");
  need("tripPairing", /status: legs\[0\]\?\.status/, "Trip Pairing shows the CURRENT leg's status, not the last leg's (D12)");
  need("planner", /AND \$\{canonicalDispatchWorkWhereClause\("l", "\$1::uuid"\)\}/, "Planner loads = the board set (D2)");
  need("planner", /unassigned_loads/, "Planner returns board loads with no driver (D4)");
  ban("planner", /FROM views\.live_loads|liveLoadsOpenDispatchExistsSql\(/, "Planner reads views.live_loads (D2)");
  ban("overview", /FROM views\.live_loads\s+WHERE operating_company_id = \$1::uuid\s+AND live_state = 'open_dispatch'/, "Overview counts read views.live_loads open_dispatch (D2)");
  for (const k of ["list", "dispatchLoads", "truckLine", "tripPairing", "planner", "overview"])
    ban(k, /ORDER BY [a-z_.]+\.(?:created_at|assigned_at) DESC LIMIT 1\)[^\n]*new_driver_id|new_driver_id[^\n]*ORDER BY [a-z_.]+\.(?:created_at|assigned_at) DESC/, "reads a board driver from the latest assignment-history row (driver comes from mdata.loads)");
  // 443.206 — assignment-history readers: a later trailer-only row (no driver, no unit) is not a reassignment, and a
  // merged-away driver record counts as its survivor (Home hop.assign probe: 23 -> 134 on prod, = its ceiling).
  // LEAD 443.249 — the planners show THE board set (board_scope live, no date filter) and keep the loads whose span overlaps
  // the range; the load list's stop time is the appointment, then the scheduled arrival (the load service's rule).
  need("plannerBars", /const board = await listAllLoads\(\{ operating_company_id: \[operatingCompanyId\], board_scope: "live" \}\);/, "the planners read THE board set (board_scope live, no date filter)");
  need("plannerBars", /\.filter\(\(load\) => plannerLoadInRange\(load, rangeStart, rangeEnd\)\)/, "the planners keep the board loads whose span OVERLAPS the range");
  ban("plannerBars", /pickup_date_from|delivery_date_from/, "the planners filter by pickup / delivery date (a load spanning the range drops out)");
  need("driverGrid", /const drivers = \[\.\.\.\(query\.data\.drivers \?\? \[\]\), \.\.\.loadDrivers\.values\(\)\];/, "every driver on a board load has a Driver Planner row (not only the scheduler roster)");
  need("mdataLoads", /SELECT city, COALESCE\(appointment_start_at, scheduled_arrival_at\) AS scheduled_arrival_at/, "the load list's stop time is appointment, then scheduled arrival");
  need("scenarios", /AND \(later\.new_driver_id IS NOT NULL OR later\.new_unit_id IS NOT NULL\)/, "hop.assign treats a trailer-only history row as a reassignment");
  need("scenarios", /COALESCE\(hd\.merged_into_driver_id, h\.new_driver_id\) = l\.assigned_primary_driver_id/, "hop.assign compares a merged-away driver record, not its survivor");
  return f;
}
// 443.206R — the load service is the ONLY reader of views.live_loads (owner law 09-28): any other backend file reading the view
// in SQL (not a comment) is a second reader.
import { readdirSync, statSync } from "node:fs";
export function viewReadersOutsideService(files) {
  const bad = [];
  for (const [rel, src] of files) {
    if (rel.endsWith("dispatch/load-service.ts")) continue;
    src.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/--.*$/, "");
      if (/^\s*\*/.test(line)) return;
      if (/\bFROM\s+views\.live_loads\b|\bJOIN\s+views\.live_loads\b/.test(code)) bad.push(`${rel}:${i + 1}`);
    });
  }
  return bad;
}
// LEAD 00:35Z parity re-run #2 — 13699's customer trailer L28591 showed on 8 surfaces but NULL on Load Costs + Loads report:
// they kept their own trailer lateral. Any backend file that projects a load's trailer_number from assignment history must
// project it through loadServiceTrailerNumberSql (customer / none / fleet). bills.service.ts is a BILL's equipment, not a load row.
const TRAILER_PROJECTION_EXEMPT = ["dispatch/load-service.ts", "accounting/bills.service.ts"];
export function trailerProjectionFailures(files) {
  const bad = [];
  for (const [rel, src] of files) {
    if (TRAILER_PROJECTION_EXEMPT.some((e) => rel.endsWith(e))) continue;
    const readsHistoryTrailer = /lah\.new_trailer_id|loadServiceTrailerLateralSql\(/.test(src);
    if (readsHistoryTrailer && /AS trailer_number\b/.test(src) && !/\$\{loadServiceTrailerNumberSql\(/.test(src))
      bad.push(`${rel}: projects trailer_number from assignment history without loadServiceTrailerNumberSql (a customer trailer shows null)`);
  }
  return bad;
}
function backendTsFiles() {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(new URL(`../${d}`, import.meta.url))) {
    const rel = `${d}/${n}`;
    if (n === "node_modules" || n === "__tests__" || n.startsWith(".")) continue;
    const st = statSync(new URL(`../${rel}`, import.meta.url));
    if (st.isDirectory()) walk(rel); else if (rel.endsWith(".ts") && !rel.endsWith(".test.ts")) out.push([rel, readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")]);
  } };
  walk("apps/backend/src");
  return out;
}
const readOrEmpty = (rel) => { try { return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"); } catch { return ""; } };
const readBoards = () => Object.fromEntries(Object.entries(BOARD_FILES).map(([k, rel]) => [k, readOrEmpty(rel)]));

async function selftest() {
  const { canonicalActiveLoadWhereClause, currentTruckLineLoadSql, UNIT_IN_SERVICE_SQL, canonicalDispatchWorkStatusClause } =
    await loadFragments();
  const failures = [];
  const canonicalSql = canonicalActiveLoadWhereClause("l");
  if (!canonicalSql.includes("l.status IN")) failures.push("canonicalActiveLoadWhereClause did not produce a status IN clause");
  if (!/status IN/.test(currentTruckLineLoadSql("x"))) {
    failures.push("currentTruckLineLoadSql (canonical alias) did not produce a status IN clause");
  }
  if (!UNIT_IN_SERVICE_SQL.includes("InService")) failures.push("UNIT_IN_SERVICE_SQL import looks wrong (no InService check)");
  const dispatchWorkSql = canonicalDispatchWorkStatusClause("l");
  if (!dispatchWorkSql.includes("l.status IN")) failures.push("canonicalDispatchWorkStatusClause did not produce a status IN clause");
  if (dispatchWorkSql.includes("completed_docs_received")) failures.push("canonicalDispatchWorkStatusClause must never include completed_docs_received");
  const base = readBoards();
  const baseStatic = [...staticFailures(base), ...viewReadersOutsideService(backendTsFiles()).map((x) => `second reader of views.live_loads: ${x}`)];
  if (!viewReadersOutsideService([["apps/backend/src/dispatch/x.ts", "const q = `SELECT 1 FROM views.live_loads l`;"]]).length) failures.push('plant "second view reader" not caught');
  const tp = trailerProjectionFailures(backendTsFiles());
  if (tp.length) failures.push(`trailer projection baseline not clean: ${tp.join(" | ")}`);
  if (!trailerProjectionFailures([["apps/backend/src/reports/x.ts", "LEFT JOIN LATERAL (SELECT eq.equipment_number AS trailer_number FROM dispatch.load_assignment_history lah JOIN mdata.equipment eq ON eq.id = lah.new_trailer_id) tr ON true"]]).length)
    failures.push('plant "own trailer lateral" not caught');
  if (baseStatic.length) failures.push(`static baseline not clean: ${baseStatic.join(" | ")}`);
  const plants = [
    ["board set back to a status list on mdata.loads", "canonical", (x) => x.replace('AND ${loadServiceMembershipSql(alias, "open_dispatch", operatingCompanyIdParam)}`;', "`;")],
    ["live map back to in_transit only", "liveMap", (x) => x.replace('${loadServiceMembershipSql("l", "open_dispatch", "$1::uuid")}', "l.status::text = 'in_transit'")],
    ["live map drops driver_uuid alias", "liveMap", (x) => x.replace(/driver_uuid:\s*driverId,?\n?/g, "")],
    ["sidebar drafts back to quicksave-only", "drafts", (x) => x.replace("AND (status = 'draft' OR is_quicksave_draft = true)", "AND is_quicksave_draft = true")],
    ["profile current load back on a private list", "unitAgg", (x) => x + "\n// AND l.status::text NOT IN ('delivered', 'cancelled', 'void', 'completed', 'closed')"],
    ["driver name overwritten by the short label", "dispatchLoads", (x) => x + "\nconst y = { assigned_primary_driver_name: driverLabel };"],
    ["unit gate back to the lease alone", "canonical", (x) => x.replace("COALESCE(${unitAlias}.currently_leased_to_company_id, ${unitAlias}.owner_company_id)", "${unitAlias}.currently_leased_to_company_id")],
    ["list without row clause", "list", (x) => x.replace('const existsSql = `${canonicalDispatchWorkStatusClause("l")} AND ${canonicalBoardRowClause("l")}`', 'const existsSql = canonicalDispatchWorkStatusClause("l")')],
    ["GET /dispatch/loads default not the service", "dispatchLoads", (x) => x.replace('filters.push(`${canonicalDispatchWorkStatusClause("l")} AND ${loadServiceMembershipSql("l", "open_dispatch", "$1::uuid")}`);', 'filters.push(canonicalDispatchWorkStatusClause("l"));')],
    ["tile back on views.live_loads", "dispatchLoads", (x) => x + "\nconst t = `FROM views.live_loads\n WHERE operating_company_id = $1::uuid\n AND live_state = 'open_dispatch'`;"],
    ["truck line gates loads on unit", "truckLine", (x) => x.replace('AND ${CURRENT_TRUCK_LINE_LOAD_SQL.replace(/\\bx\\./g, "l.")}', 'AND ${CURRENT_TRUCK_LINE_LOAD_SQL.replace(/\\bx\\./g, "l.")}\n          AND ${UNIT_IN_SERVICE_SQL}')],
    ["trip pairing last-leg status", "tripPairing", (x) => x.replace("status: legs[0]?.status", "status: legs[legs.length - 1]?.status")],
    ["planner on views.live_loads", "planner", (x) => x + "\nconst q = `SELECT 1 FROM views.live_loads cl`;"],
    ["overview on views.live_loads", "overview", (x) => x + "\nconst q = `FROM views.live_loads\n WHERE operating_company_id = $1::uuid\n AND live_state = 'open_dispatch'`;"],
    ["scenario counts trailer-only rows", "scenarios", (x) => x.replace("AND (later.new_driver_id IS NOT NULL OR later.new_unit_id IS NOT NULL)", "")],
    ["driver from latest history", "tripPairing", (x) => x + "\nconst q = `SELECT h.new_driver_id FROM dispatch.load_assignment_history h ORDER BY h.created_at DESC LIMIT 1`;"],
    ["available back to driver-centric CTE", "truckLine", (x) => x.replace("FROM mdata.units u", "FROM qualifying q")],
    ["planners back on date-filtered reads", "plannerBars", (x) => x.replace('board_scope: "live" });', 'board_scope: "live", pickup_date_from: rangeStart });')],
    ["planners drop the overlap rule", "plannerBars", (x) => x.replace(".filter((load) => plannerLoadInRange(load, rangeStart, rangeEnd))", "")],
    ["driver planner back to the roster only", "driverGrid", (x) => x.replace("const drivers = [...(query.data.drivers ?? []), ...loadDrivers.values()];", "const drivers = query.data.drivers ?? [];")],
    ["load list stop time back to scheduled only", "mdataLoads", (x) => x.replaceAll("SELECT city, COALESCE(appointment_start_at, scheduled_arrival_at) AS scheduled_arrival_at", "SELECT city, scheduled_arrival_at")],
    ["units-without-load drops UNIT_IN_SERVICE_SQL", "dispatchLoads", (x) => x.replace("WHERE ${UNIT_IN_SERVICE_SQL}", "WHERE true")],
  ];
  for (const [name, k, mut] of plants) {
    const planted = mut(base[k]);
    if (planted === base[k]) failures.push(`plant "${name}" did not apply`);
    else if (!staticFailures({ ...base, [k]: planted }).length) failures.push(`plant "${name}" not caught`);
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — imports produce the expected fragments; ${plants.length} static plants caught`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    await selftest();
    return;
  }
  const sf = [...staticFailures(readBoards()), ...viewReadersOutsideService(backendTsFiles()).map((x) => `second reader of views.live_loads (the load service is the only reader): ${x}`), ...trailerProjectionFailures(backendTsFiles())];
  if (sf.length) {
    console.error(`${LABEL}: FAIL (static) —\n  - ${sf.join("\n  - ")}`);
    process.exitCode = 1;
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: static PASS; live SKIP — no DATABASE_URL (live-data invariant by design).`);
    return;
  }
  const {
    canonicalActiveLoadWhereClause,
    canonicalActiveLoadNotFinishedByMoneyCte,
    canonicalLoadCostsOpenClause,
    canonicalDispatchWorkStatusClause,
    currentTruckLineLoadSql,
    UNIT_IN_SERVICE_SQL,
  } = await loadFragments();
  const { default: pg } = await import("pg");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: inferPgSslOption(process.env.DATABASE_URL) });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // ACCOUNTING canonical — Load Costs only.
    const canonical = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${canonicalLoadCostsOpenClause("l")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    // DISPATCH WORK canonical — every other board's reference set (TRUCKLINE-16; 443.206: incl. the row exclusions).
    const dispatchWork = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${canonicalDispatchWorkStatusClause("l")} AND l.voided_at IS NULL AND l.is_sample_data IS NOT TRUE
        ORDER BY l.load_number`,
      [USMCA]
    );

    // List / Kanban / Round Trips — GET /mdata/loads?board_scope=live (mdata/loads.routes.ts).
    const listLoadsLive = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${canonicalDispatchWorkStatusClause("l")} AND l.voided_at IS NULL AND l.is_sample_data IS NOT TRUE
        ORDER BY l.load_number`,
      [USMCA]
    );

    // Load Costs — mirrors load-costs-board.routes.ts (accounting-active, money-aware).
    // ROUND 292: pass l.status so FACTOR-BUT-NOT-DELIVERED (pre-delivery + issued invoice)
    // matches canonicalActiveLoadWhereClause — else 13625/13626 drift off Load Costs.
    const loadCosts = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${canonicalLoadCostsOpenClause("l")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    // Trip Pairing — trip-pairing-board.service.ts membership query.
    const tripPairing = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND ${canonicalDispatchWorkStatusClause("l")} AND l.voided_at IS NULL AND l.is_sample_data IS NOT TRUE
          AND l.assigned_unit_id IS NOT NULL
        ORDER BY l.load_number`,
      [USMCA]
    );

    // Truck Line — truck-line.routes.ts (+ assigned in-service unit).
    const truckLine = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        JOIN mdata.units u ON u.id = l.assigned_unit_id
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND l.assigned_unit_id IS NOT NULL
          AND ${currentTruckLineLoadSql("l")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    // LEAD 443.206 — the REAL board functions (not copied SQL): the board set, Trip Pairing, Overview breakdown.
    const { listCanonicalDispatchWorkLoadIds } = await import("../apps/backend/src/dispatch/canonical-active-load-set.ts");
    const { getTripPairingBoard } = await import("../apps/backend/src/dispatch/trip-pairing-board.service.ts");
    const { getOpenLoadsBreakdown, countOnLoadDispatchLoads } = await import("../apps/backend/src/dispatch/active-loads-count.ts");
    const boardIds = new Set(await listCanonicalDispatchWorkLoadIds(client, USMCA));
    const tp = await getTripPairingBoard(client, USMCA, new Date());
    const tpIds = new Set(tp.tours.flatMap((t) => t.legs.map((l) => l.load_id)));
    const assignedUnitBoardIds = new Set((await client.query(
      `SELECT l.id::text AS id FROM mdata.loads l WHERE l.id = ANY($1::uuid[]) AND l.assigned_unit_id IS NOT NULL`, [[...boardIds]])).rows.map((r) => r.id));
    const breakdown = await getOpenLoadsBreakdown(client, USMCA);
    // 443.206R — the service itself, Driver Hub on-load, and Trip Pairing's driver = the one projection.
    const { listLoadServiceIds } = await import("../apps/backend/src/dispatch/load-service.ts");
    const serviceIds = new Set(await listLoadServiceIds(client, { operatingCompanyId: USMCA, state: "open_dispatch" }));
    const { readDriverHub } = await import("../apps/backend/src/mdata/canonical/driver-hub.service.ts");
    const { DISPATCH_ON_LOAD_STATUSES } = await import("../apps/backend/src/dispatch/active-loads-count.ts");
    const hub = await readDriverHub(client, USMCA);
    const hubOnLoad = new Set((Array.isArray(hub) ? hub : hub.rows ?? hub.drivers ?? []).filter((d) => d.on_load).map((d) => String(d.id)));
    const onLoadDrivers = new Set((await client.query(
      `SELECT DISTINCT x.d::text AS id FROM mdata.loads l, LATERAL (VALUES (l.assigned_primary_driver_id), (l.assigned_secondary_driver_id)) x(d)
        WHERE l.id = ANY($1::uuid[]) AND x.d IS NOT NULL AND l.status::text = ANY($2::text[])`, [[...serviceIds], [...DISPATCH_ON_LOAD_STATUSES]])).rows.map((r) => r.id));
    const { loadServiceDriverNameSql } = await import("../apps/backend/src/dispatch/load-service.ts");
    const projected = new Map((await client.query(
      `SELECT l.id::text AS id, ${loadServiceDriverNameSql("l", "d")} AS name FROM mdata.loads l
         LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id WHERE l.id = ANY($1::uuid[])`, [[...serviceIds]])).rows.map((r) => [r.id, r.name]));
    const onLoad = await countOnLoadDispatchLoads(client, USMCA);
    const onLoadRef = Number((await client.query(
      `SELECT count(*)::int n FROM mdata.loads l WHERE l.id = ANY($1::uuid[]) AND l.status IN ('dispatched','at_pickup','in_transit','at_delivery')`, [[...boardIds]])).rows[0].n);

    await client.query("ROLLBACK");

    // LEAD 23:45Z P0 — EXECUTE every repointed reader against real Postgres (a reader that cannot even run — Dispatcher Home's
    // "could not determine data type of parameter $3" — is the worst disagreement of all).
    const executed = [];
    const OWNER_USER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
    const tryRead = async (name, fn) => {
      try { await client.query("BEGIN READ ONLY"); await client.query("SELECT set_config('app.bypass_rls','lucia',true)"); await fn(); executed.push(name); }
      catch (e) { executeFailures.push(`${name} does not execute on prod: ${e.message}`); }
      finally { await client.query("ROLLBACK").catch(() => {}); }
    };
    const executeFailures = [];
    const { loadDispatcherHomeOnClient } = await import("../apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts");
    await tryRead("Dispatcher Home", () => loadDispatcherHomeOnClient(client, OWNER_USER, USMCA));
    await tryRead("Driver Hub", () => readDriverHub(client, USMCA));
    await tryRead("Overview OPEN LOADS", () => getOpenLoadsBreakdown(client, USMCA));

    // LEAD 23:45Z parity — the four disagreements the owner's harness found, measured on the REAL readers.
    const parity = [];
    const { loadPlannerWeekOnClient } = await import("../apps/backend/src/dispatch/planner.service.ts");
    const { getFleetSchedule } = await import("../apps/backend/src/safety/driver-scheduler.service.ts");
    const { getLivePositionsForActiveLoads } = await import("../apps/backend/src/integrations/samsara/positions/live-position.service.ts");
    const { loadServiceTrailerNumberSql } = await import("../apps/backend/src/dispatch/load-service.ts");
    const boardRows = (await (async () => { await client.query("BEGIN READ ONLY"); await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
      const r = (await client.query(`SELECT l.id::text id, l.load_number, l.assigned_primary_driver_id::text driver_id, l.assigned_unit_id::text unit_id, l.trailer_source,
          ${loadServiceTrailerNumberSql("l", "tr")} AS trailer_number
        FROM mdata.loads l LEFT JOIN LATERAL (SELECT eq.equipment_number FROM dispatch.load_assignment_history lah JOIN mdata.equipment eq ON eq.id = lah.new_trailer_id
          WHERE lah.load_id = l.id AND lah.new_trailer_id IS NOT NULL ORDER BY lah.assigned_at DESC LIMIT 1) tr ON true
        WHERE l.id = ANY($1::uuid[])`, [[...serviceIds]])).rows; await client.query("ROLLBACK"); return r; })());
    const today = new Date().toISOString().slice(0, 10);
    await tryRead("Planner week", async () => {
      const wk = await loadPlannerWeekOnClient(client, USMCA, "2000-01-01", "2100-01-01", "2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z");
      const rosterIds = new Set(wk.drivers.map((d) => d.id));
      for (const r of boardRows) if (r.driver_id && wk.loads.some((x) => x.id === r.id) && !rosterIds.has(r.driver_id)) parity.push(`Planner: load ${r.load_number}'s driver is not on the planner roster (driver shows null)`);
    });
    await tryRead("Fleet schedule (Driver Hub scheduler)", async () => {
      const fs = await getFleetSchedule(client, { operatingCompanyId: USMCA, startDate: today, endDate: today });
      const busy = new Set(boardRows.map((r) => r.unit_id).filter(Boolean));
      for (const u of fs.vacant_units) if (busy.has(u.unit_id)) parity.push(`Driver Hub scheduler lists working truck ${u.unit_number} as vacant`);
    });
    await tryRead("Live map", async () => {
      const pos = await getLivePositionsForActiveLoads(client, USMCA);
      for (const p of pos) if (!("driver_id" in p) || !("driver_uuid" in p)) { parity.push("Live map rows carry no driver_id/driver_uuid"); break; }
      for (const p of pos) {
        if (p.driver_id !== p.driver_uuid) parity.push(`Live map driver_uuid ≠ driver_id for load ${p.load_uuid}`);
        const b = boardRows.find((r) => r.id === p.load_uuid);
        if (b?.driver_id && p.driver_id !== b.driver_id) parity.push(`Live map driver for load ${b.load_number} ≠ the load's driver`);
        if (b?.driver_id && p.driver_uuid !== b.driver_id) parity.push(`Live map driver_uuid for load ${b.load_number} ≠ the load's driver`);
      }
    });
    for (const r of boardRows) if (r.trailer_source === "customer" && !r.trailer_number) parity.push(`load ${r.load_number}: customer trailer missing from the board projection`);

    const realFailures = [...executeFailures, ...parity];
    const sDrift = [...[...serviceIds].filter((x) => !boardIds.has(x)), ...[...boardIds].filter((x) => !serviceIds.has(x))];
    if (sDrift.length) realFailures.push(`load service open_dispatch ≠ board set: ${sDrift.length}`);
    const hubMissing = [...onLoadDrivers].filter((x) => !hubOnLoad.has(x));
    const hubExtra = [...hubOnLoad].filter((x) => !onLoadDrivers.has(x));
    if (hubMissing.length || hubExtra.length)
      realFailures.push(`Driver Hub on-load (real function) ≠ the service's on-load drivers: missing ${hubMissing.length}, extra ${hubExtra.length}`);
    for (const t of tp.tours) {
      const cur = t.legs[0];
      if (!cur || !t.driver_name) continue;
      const want = projected.get(cur.load_id);
      if (want && want.trim() !== t.driver_name.trim()) realFailures.push(`Trip Pairing driver for ${t.unit_number} "${t.driver_name}" ≠ projection "${want}"`);
    }
    const idDrift = [...[...tpIds].filter((x) => !assignedUnitBoardIds.has(x)), ...[...assignedUnitBoardIds].filter((x) => !tpIds.has(x))];
    if (idDrift.length) realFailures.push(`Trip Pairing (real function) disagrees with the board set's unit-assigned loads: ${idDrift.length}`);
    if (breakdown.total !== boardIds.size) realFailures.push(`Overview OPEN LOADS (real function) ${breakdown.total} ≠ board set ${boardIds.size}`);
    if (onLoad !== onLoadRef) realFailures.push(`Overview ON LOAD (real function) ${onLoad} ≠ board set on-load ${onLoadRef}`);

    // LEAD 443.231b LIVE — available unit set + driver per unit identical across Truck Line AVAILABLE
    // and Unassigned units. Mirror each route's FROM/WHERE (both must use UNIT_IN_SERVICE_SQL +
    // unitCurrentDriverSql + no board-set load) and compare the maps.
    const { unitCurrentDriverSql } = await import("../apps/backend/src/dispatch/unit-current-driver.ts");
    const { canonicalDispatchWorkWhereClause: boardWorkWhere } = await import("../apps/backend/src/dispatch/canonical-active-load-set.ts");
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    // Truck Line AVAILABLE shape (truck-line.routes.ts).
    const truckLineAvailable = await client.query(
      `SELECT u.id::text AS unit_id, u.unit_number, ud.id::text AS driver_id
         FROM mdata.units u
         LEFT JOIN mdata.loads board_l
           ON board_l.assigned_unit_id = u.id
          AND board_l.soft_deleted_at IS NULL
          AND ${boardWorkWhere("board_l", "$1::uuid")}
         ${unitCurrentDriverSql("u", "$1::uuid")}
        WHERE ${UNIT_IN_SERVICE_SQL}
          AND board_l.id IS NULL
        ORDER BY u.unit_number ASC NULLS LAST, u.id`,
      [USMCA]
    );
    // units-without-load shape (loads.routes.ts) — same gate, join alias `l` for occupied check.
    const unassignedUnits = await client.query(
      `SELECT u.id::text AS unit_id, u.unit_number, ud.id::text AS driver_id
         FROM mdata.units u
         LEFT JOIN mdata.loads l
           ON l.assigned_unit_id = u.id
          AND l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND ${boardWorkWhere("l", "$1::uuid")}
         ${unitCurrentDriverSql("u", "$1::uuid")}
        WHERE ${UNIT_IN_SERVICE_SQL}
          AND l.id IS NULL
        ORDER BY u.unit_number ASC NULLS LAST, u.id`,
      [USMCA]
    );
    await client.query("ROLLBACK");
    const key = (r) => `${r.unit_id}|${r.driver_id ?? ""}`;
    const tlMap = new Map(truckLineAvailable.rows.map((r) => [r.unit_id, key(r)]));
    const uaMap = new Map(unassignedUnits.rows.map((r) => [r.unit_id, key(r)]));
    if (tlMap.size !== truckLineAvailable.rows.length) {
      realFailures.push(`443.231b Truck Line AVAILABLE has duplicate unit_id (rows=${truckLineAvailable.rows.length} unique=${tlMap.size})`);
    }
    if (uaMap.size !== unassignedUnits.rows.length) {
      realFailures.push(`443.231b Unassigned units has duplicate unit_id (rows=${unassignedUnits.rows.length} unique=${uaMap.size})`);
    }
    const onlyTl = [...tlMap.keys()].filter((id) => !uaMap.has(id));
    const onlyUa = [...uaMap.keys()].filter((id) => !tlMap.has(id));
    if (onlyTl.length || onlyUa.length) {
      realFailures.push(
        `443.231b available unit set drift — only Truck Line: ${onlyTl.join(",") || "∅"}; only Unassigned: ${onlyUa.join(",") || "∅"}`
      );
    }
    for (const [unitId, tlKey] of tlMap) {
      const uaKey = uaMap.get(unitId);
      if (uaKey && uaKey !== tlKey) {
        realFailures.push(`443.231b driver drift for unit ${unitId}: truck-line=${tlKey} unassigned=${uaKey}`);
      }
    }
    console.log(
      `${LABEL}: 443.231b available parity OK — count=${truckLineAvailable.rows.length} ` +
        `units=${truckLineAvailable.rows.map((r) => `${r.unit_number}:${r.driver_id ? "drv" : "—"}`).join(",")}`
    );

    const canonicalSet = new Set(canonical.rows.map((r) => r.load_number));
    const dispatchWorkSet = new Set(dispatchWork.rows.map((r) => r.load_number));
    // ACCOUNTING (money-aware) vs DISPATCH WORK (status-only) — TRUCKLINE-16. Load Costs is the
    // ONLY board answering the accounting question; every other board answers dispatch work and
    // must agree with dispatchWorkSet, never with canonicalSet.
    const accountingBoards = [["Load Costs", new Set(loadCosts.rows.map((r) => r.load_number)), canonicalSet]];
    const dispatchBoards = [
      ["GET /mdata/loads board_scope=live (List/Kanban/Round Trips)", new Set(listLoadsLive.rows.map((r) => r.load_number)), dispatchWorkSet],
      // Trip Pairing / Truck Line list only unit-assigned loads by construction.
      ["Trip Pairing", new Set(tripPairing.rows.map((r) => r.load_number)), new Set(truckLine.rows.map((r) => r.load_number))],
      ["Truck Line", new Set(truckLine.rows.map((r) => r.load_number)), new Set(tripPairing.rows.map((r) => r.load_number))],
    ];

    const failures = [...realFailures];
    const diff = (a, b) => [...a].filter((x) => !b.has(x));

    for (const [name, set, reference] of [...accountingBoards, ...dispatchBoards]) {
      const drift = [...diff(set, reference), ...diff(reference, set)];
      if (drift.length) failures.push(`${name} disagrees with its reference set: count=${drift.length}`);
    }

    if (failures.length) {
      console.error(`${LABEL}: FAIL —\n  - ${failures.join("\n  - ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `${LABEL}: PASS — Load Costs agrees with the accounting canonical (${canonicalSet.size} loads); ` +
        `List/Kanban/Round Trips, Trip Pairing and Truck Line all agree with the dispatch-work canonical (${dispatchWorkSet.size} loads); ` +
        `executed ${executed.length} readers (${executed.join(", ")}); parity 0 (planner drivers, scheduler vacancy, live-map driver, customer trailers); real functions: load service ${serviceIds.size}, Trip Pairing ${tpIds.size} legs, Overview OPEN LOADS ${breakdown.total}, ON LOAD ${onLoad}, Driver Hub on-load ${hubOnLoad.size}.`
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
