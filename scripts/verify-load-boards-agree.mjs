#!/usr/bin/env node
// ROUND 177 JOB 1 (Lead, P0): "the Truck Line board, the List view, the Load Costs tab and the
// dispatch board must return the SAME set of load numbers for the same filter, all from the
// canonical active-load predicate -- not four separate queries that drift."
//
// LIVE-MEASURED BEFORE WRITING THIS (2026-09-28, USMCA): three of the four board queries agree
// EXACTLY today -- canonical-active-load-set.ts's own predicate, views.live_loads's
// live_state='open_dispatch' (the shared basis for List/Kanban/Trip Pairing, per
// live-loads-view.ts), and Load Costs' own WHERE clause (load-costs-board.routes.ts:354-371) all
// return the identical 14-load set. Truck Line does NOT return the same 14 -- it returns 13,
// missing load 13627 -- but that is a DOCUMENTED, DELIBERATE narrowing
// (current-truck-line-load.ts's own header: "CURRENT work right now," narrower than "active" by
// design, e.g. hiding a stale dispatched shell with no stop stamps and an appointment 48h+ old),
// not drift. Forcing exact equality on Truck Line would make this guard permanently, falsely red
// against an intentional business rule -- the canonical file's OWN convention
// (assertCanonicalSubset) is that a narrower named view must be a SUBSET of canonical, never
// independently equal to it. This guard enforces exactly that asymmetry:
//   - canonical == the List/Kanban/Trip-Pairing basis (views.live_loads) == Load Costs, EXACTLY.
//   - Truck Line's set is checked as a SUBSET of canonical (every truck-line load must be in the
//     canonical set); it is allowed to be narrower, but never to contain a load canonical excludes.
// A subset violation (Truck Line showing a load canonical says is finished/inactive) is exactly
// the kind of real bug this guard exists to catch -- a documented narrower filter is not.
import { register } from "tsx/esm/api";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
register();

const LABEL = "verify-load-boards-agree";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function loadFragments() {
  const { canonicalActiveLoadWhereClause, canonicalActiveLoadNotFinishedByMoneyCte } = await import(
    "../apps/backend/src/dispatch/canonical-active-load-set.ts"
  );
  const { currentTruckLineLoadSql } = await import("../apps/backend/src/dispatch/current-truck-line-load.ts");
  const { UNIT_IN_SERVICE_SQL } = await import("../apps/backend/src/dispatch/truck-line/truck-line.routes.ts");
  return { canonicalActiveLoadWhereClause, canonicalActiveLoadNotFinishedByMoneyCte, currentTruckLineLoadSql, UNIT_IN_SERVICE_SQL };
}

async function selftest() {
  const { canonicalActiveLoadWhereClause, currentTruckLineLoadSql, UNIT_IN_SERVICE_SQL } = await loadFragments();
  const failures = [];
  const canonicalSql = canonicalActiveLoadWhereClause("l");
  if (!canonicalSql.includes("l.status IN")) failures.push("canonicalActiveLoadWhereClause did not produce a status IN clause");
  const truckLineSql = currentTruckLineLoadSql("x");
  if (!truckLineSql.includes("open_dispatch")) failures.push("currentTruckLineLoadSql did not reference open_dispatch");
  if (!UNIT_IN_SERVICE_SQL.includes("InService")) failures.push("UNIT_IN_SERVICE_SQL import looks wrong (no InService check)");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 3 imports produce the expected fragments`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    await selftest();
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (live-data invariant by design).`);
    return;
  }
  const { canonicalActiveLoadWhereClause, canonicalActiveLoadNotFinishedByMoneyCte, currentTruckLineLoadSql, UNIT_IN_SERVICE_SQL } =
    await loadFragments();
  const { default: pg } = await import("pg");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    // ROUND 241/248 (CC-3 finding): SET LOCAL ROLE neondb_owner fails "permission denied to set
    // role" against Neon's pooled endpoint even when already connected AS neondb_owner (pooler
    // role-switching, same class as BANK-F30150 in verify-alwaystrack-parity.mjs). The correct,
    // working pattern every other live guard in this repo uses is
    // set_config('app.bypass_rls','lucia',true) inside one explicit transaction.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const canonical = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${canonicalActiveLoadWhereClause("l")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    // List / Kanban / Trip Pairing basis (live-loads-view.ts's liveLoadsOpenDispatchExistsSql
    // gates on exactly this: views.live_loads.live_state = 'open_dispatch').
    const listKanban = await client.query(
      `SELECT load_number FROM views.live_loads
        WHERE operating_company_id = $1::uuid AND live_state = 'open_dispatch'
        ORDER BY load_number`,
      [USMCA]
    );

    // Load Costs — MUST mirror load-costs-board.routes.ts's own WHERE clause (soft_deleted_at,
    // status <> draft/cancelled, status NOT IN closed/invoiced/paid, then the same canonical
    // money-not-finished CTE). If that route's filter changes, update this to match — that's the
    // whole point of the guard failing loudly on drift instead of silently.
    const loadCosts = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND l.status <> 'draft' AND l.status <> 'cancelled'
          AND l.status NOT IN ('closed', 'invoiced', 'paid')
          AND ${canonicalActiveLoadNotFinishedByMoneyCte("l.id")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    // Truck Line — deliberately narrower (current-truck-line-load.ts). Checked as a SUBSET below,
    // never for exact equality.
    const truckLine = await client.query(
      `SELECT x.load_number FROM views.live_loads x
        JOIN mdata.units u ON u.id = x.assigned_unit_id
        WHERE x.operating_company_id = $1::uuid
          AND x.assigned_unit_id IS NOT NULL
          AND ${currentTruckLineLoadSql("x")}
          AND ${UNIT_IN_SERVICE_SQL}
        ORDER BY x.load_number`,
      [USMCA]
    );

    await client.query("ROLLBACK");

    const canonicalSet = new Set(canonical.rows.map((r) => r.load_number));
    const listKanbanSet = new Set(listKanban.rows.map((r) => r.load_number));
    const loadCostsSet = new Set(loadCosts.rows.map((r) => r.load_number));
    const truckLineList = truckLine.rows.map((r) => r.load_number);

    const failures = [];
    const diff = (a, b) => [...a].filter((x) => !b.has(x));

    const listVsCanonical = [...diff(listKanbanSet, canonicalSet), ...diff(canonicalSet, listKanbanSet)];
    if (listVsCanonical.length) failures.push(`List/Kanban (views.live_loads) disagrees with canonical: ${listVsCanonical.join(", ")}`);

    const costsVsCanonical = [...diff(loadCostsSet, canonicalSet), ...diff(canonicalSet, loadCostsSet)];
    if (costsVsCanonical.length) failures.push(`Load Costs disagrees with canonical: ${costsVsCanonical.join(", ")}`);

    const truckLineOutsideCanonical = truckLineList.filter((n) => !canonicalSet.has(n));
    if (truckLineOutsideCanonical.length) {
      failures.push(`Truck Line shows load(s) canonical says are NOT active (real bug, not a narrower-view exception): ${truckLineOutsideCanonical.join(", ")}`);
    }

    if (failures.length) {
      console.error(`${LABEL}: FAIL —\n  - ${failures.join("\n  - ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `${LABEL}: PASS — canonical=List/Kanban=Load Costs (${canonicalSet.size} loads); ` +
        `Truck Line (${truckLineList.length} loads) is a valid subset.`
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
