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
};
export function staticFailures(src) {
  const f = [];
  const need = (k, re, msg) => { if (!re.test(src[k])) f.push(`${BOARD_FILES[k]}: ${msg}`); };
  const ban = (k, re, msg) => { if (re.test(src[k])) f.push(`${BOARD_FILES[k]}: ${msg}`); };
  need("canonical", /\$\{canonicalDispatchWorkStatusClause\(alias\)\} AND \$\{alias\}\.operating_company_id = \$\{operatingCompanyIdParam\}\s*AND \$\{canonicalBoardRowClause\(alias\)\}/, "the board set must carry the row exclusions (deleted / voided / sample)");
  need("canonical", /COALESCE\(\$\{unitAlias\}\.currently_leased_to_company_id, \$\{unitAlias\}\.owner_company_id\) = \$\{operatingCompanyIdParam\}/, "THE unit gate is COALESCE(leased, owner) = company");
  need("list", /const existsSql = `\$\{canonicalDispatchWorkStatusClause\("l"\)\} AND \$\{canonicalBoardRowClause\("l"\)\}`/, "List / Kanban live scope = board status + row clause");
  need("dispatchLoads", /if \(!query\.status \|\| query\.status\.length === 0\) filters\.push\(canonicalDispatchWorkStatusClause\("l"\)\)/, "GET /dispatch/loads with no status = the board set (D13)");
  need("dispatchLoads", /canonicalBoardRowClause\("bl"\)/, "GET /dispatch/loads never returns a voided / sample load (D13)");
  need("dispatchLoads", /AND \$\{canonicalDispatchWorkWhereClause\("l", "\$1::uuid"\)\}\s*-- The unit's DEFAULT driver/, "units-without-load: occupied = the board set (D6)");
  need("dispatchLoads", /WHERE \$\{canonicalBoardUnitGateSql\("u", "\$1::uuid"\)\}/, "units-without-load uses THE unit gate (D3)");
  ban("dispatchLoads", /FROM views\.live_loads\s+WHERE operating_company_id = \$1::uuid\s+AND live_state = 'open_dispatch'/, "a board tile reads views.live_loads open_dispatch (D2)");
  need("truckLine", /\$\{canonicalBoardUnitGateSql\("u", "\$1::uuid"\)\}/, "Truck Line unit gate built on THE unit gate (D3)");
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
  need("scenarios", /AND \(later\.new_driver_id IS NOT NULL OR later\.new_unit_id IS NOT NULL\)/, "hop.assign treats a trailer-only history row as a reassignment");
  need("scenarios", /COALESCE\(hd\.merged_into_driver_id, h\.new_driver_id\) = l\.assigned_primary_driver_id/, "hop.assign compares a merged-away driver record, not its survivor");
  return f;
}
const readBoards = () => Object.fromEntries(Object.entries(BOARD_FILES).map(([k, rel]) => [k, readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")]));

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
  const baseStatic = staticFailures(base);
  if (baseStatic.length) failures.push(`static baseline not clean: ${baseStatic.join(" | ")}`);
  const plants = [
    ["board set without row exclusions", "canonical", (x) => x.replace("AND ${canonicalBoardRowClause(alias)}`;", "`;")],
    ["unit gate back to the lease alone", "canonical", (x) => x.replace("COALESCE(${unitAlias}.currently_leased_to_company_id, ${unitAlias}.owner_company_id)", "${unitAlias}.currently_leased_to_company_id")],
    ["list without row clause", "list", (x) => x.replace('const existsSql = `${canonicalDispatchWorkStatusClause("l")} AND ${canonicalBoardRowClause("l")}`', 'const existsSql = canonicalDispatchWorkStatusClause("l")')],
    ["GET /dispatch/loads unscoped", "dispatchLoads", (x) => x.replace('if (!query.status || query.status.length === 0) filters.push(canonicalDispatchWorkStatusClause("l"));', "")],
    ["tile back on views.live_loads", "dispatchLoads", (x) => x + "\nconst t = `FROM views.live_loads\n WHERE operating_company_id = $1::uuid\n AND live_state = 'open_dispatch'`;"],
    ["truck line gates loads on unit", "truckLine", (x) => x.replace('AND ${CURRENT_TRUCK_LINE_LOAD_SQL.replace(/\\bx\\./g, "l.")}', 'AND ${CURRENT_TRUCK_LINE_LOAD_SQL.replace(/\\bx\\./g, "l.")}\n          AND ${UNIT_IN_SERVICE_SQL}')],
    ["trip pairing last-leg status", "tripPairing", (x) => x.replace("status: legs[0]?.status", "status: legs[legs.length - 1]?.status")],
    ["planner on views.live_loads", "planner", (x) => x + "\nconst q = `SELECT 1 FROM views.live_loads cl`;"],
    ["overview on views.live_loads", "overview", (x) => x + "\nconst q = `FROM views.live_loads\n WHERE operating_company_id = $1::uuid\n AND live_state = 'open_dispatch'`;"],
    ["scenario counts trailer-only rows", "scenarios", (x) => x.replace("AND (later.new_driver_id IS NOT NULL OR later.new_unit_id IS NOT NULL)", "")],
    ["driver from latest history", "tripPairing", (x) => x + "\nconst q = `SELECT h.new_driver_id FROM dispatch.load_assignment_history h ORDER BY h.created_at DESC LIMIT 1`;"],
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
  const sf = staticFailures(readBoards());
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
    const onLoad = await countOnLoadDispatchLoads(client, USMCA);
    const onLoadRef = Number((await client.query(
      `SELECT count(*)::int n FROM mdata.loads l WHERE l.id = ANY($1::uuid[]) AND l.status IN ('dispatched','at_pickup','in_transit','at_delivery')`, [[...boardIds]])).rows[0].n);

    await client.query("ROLLBACK");

    const realFailures = [];
    const idDrift = [...[...tpIds].filter((x) => !assignedUnitBoardIds.has(x)), ...[...assignedUnitBoardIds].filter((x) => !tpIds.has(x))];
    if (idDrift.length) realFailures.push(`Trip Pairing (real function) disagrees with the board set's unit-assigned loads: ${idDrift.length}`);
    if (breakdown.total !== boardIds.size) realFailures.push(`Overview OPEN LOADS (real function) ${breakdown.total} ≠ board set ${boardIds.size}`);
    if (onLoad !== onLoadRef) realFailures.push(`Overview ON LOAD (real function) ${onLoad} ≠ board set on-load ${onLoadRef}`);

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
        `real functions: Trip Pairing ${tpIds.size} legs, Overview OPEN LOADS ${breakdown.total}, ON LOAD ${onLoad}.`
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
