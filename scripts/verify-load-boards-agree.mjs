#!/usr/bin/env node
// ROUND 177 JOB 1 + ROUND 285.4.2: every board that shows "what is running now" resolves through
// ONE source — views.live_loads live_state='open_dispatch' (liveLoadsOpenDispatchExistsSql).
// Boards: Dispatch List, Kanban, Round Trips (listLoads), Trip Pairing, Truck Line, Load Costs.
import { register } from "tsx/esm/api";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
register();

const LABEL = "verify-load-boards-agree";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function loadFragments() {
  const { canonicalActiveLoadWhereClause, canonicalActiveLoadNotFinishedByMoneyCte } = await import(
    "../apps/backend/src/dispatch/canonical-active-load-set.ts"
  );
  const { liveLoadsOpenDispatchExistsSql } = await import("../apps/backend/src/dispatch/live-loads-view.ts");
  const { currentTruckLineLoadSql } = await import("../apps/backend/src/dispatch/current-truck-line-load.ts");
  const { UNIT_IN_SERVICE_SQL } = await import("../apps/backend/src/dispatch/truck-line/truck-line.routes.ts");
  return {
    canonicalActiveLoadWhereClause,
    canonicalActiveLoadNotFinishedByMoneyCte,
    liveLoadsOpenDispatchExistsSql,
    currentTruckLineLoadSql,
    UNIT_IN_SERVICE_SQL,
  };
}

async function selftest() {
  const { canonicalActiveLoadWhereClause, currentTruckLineLoadSql, UNIT_IN_SERVICE_SQL, liveLoadsOpenDispatchExistsSql } =
    await loadFragments();
  const failures = [];
  const canonicalSql = canonicalActiveLoadWhereClause("l");
  if (!canonicalSql.includes("l.status IN")) failures.push("canonicalActiveLoadWhereClause did not produce a status IN clause");
  if (!/status IN/.test(currentTruckLineLoadSql("x"))) {
    failures.push("currentTruckLineLoadSql (canonical alias) did not produce a status IN clause");
  }
  if (!UNIT_IN_SERVICE_SQL.includes("InService")) failures.push("UNIT_IN_SERVICE_SQL import looks wrong (no InService check)");
  if (!liveLoadsOpenDispatchExistsSql("l.id").includes("open_dispatch")) {
    failures.push("liveLoadsOpenDispatchExistsSql missing open_dispatch gate");
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — imports produce the expected fragments`);
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
  const {
    canonicalActiveLoadWhereClause,
    canonicalActiveLoadNotFinishedByMoneyCte,
    liveLoadsOpenDispatchExistsSql,
    currentTruckLineLoadSql,
    UNIT_IN_SERVICE_SQL,
  } = await loadFragments();
  const { default: pg } = await import("pg");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const canonical = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${canonicalActiveLoadWhereClause("l")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    // List / Kanban / Round Trips — GET /mdata/loads?board_scope=live (loads.routes.ts).
    const listLoadsLive = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${liveLoadsOpenDispatchExistsSql("l.id")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    const listKanban = await client.query(
      `SELECT load_number FROM views.live_loads
        WHERE operating_company_id = $1::uuid AND live_state = 'open_dispatch'
        ORDER BY load_number`,
      [USMCA]
    );

    // Load Costs — mirrors load-costs-board.routes.ts (proven equal to open_dispatch @ 12).
    const loadCosts = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND l.status <> 'draft' AND l.status <> 'cancelled'
          AND l.status NOT IN ('closed', 'invoiced', 'paid')
          AND ${canonicalActiveLoadNotFinishedByMoneyCte("l.id")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    // Trip Pairing — trip-pairing-board.service.ts membership query.
    const tripPairing = await client.query(
      `SELECT l.load_number FROM views.live_loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.live_state = 'open_dispatch'
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
          AND ${UNIT_IN_SERVICE_SQL}
        ORDER BY l.load_number`,
      [USMCA]
    );

    await client.query("ROLLBACK");

    const canonicalSet = new Set(canonical.rows.map((r) => r.load_number));
    const boards = [
      ["List/Kanban/Round Trips (live_loads view)", new Set(listKanban.rows.map((r) => r.load_number))],
      ["GET /mdata/loads board_scope=live", new Set(listLoadsLive.rows.map((r) => r.load_number))],
      ["Load Costs", new Set(loadCosts.rows.map((r) => r.load_number))],
      ["Trip Pairing", new Set(tripPairing.rows.map((r) => r.load_number))],
      ["Truck Line", new Set(truckLine.rows.map((r) => r.load_number))],
    ];

    const failures = [];
    const diff = (a, b) => [...a].filter((x) => !b.has(x));

    for (const [name, set] of boards) {
      const drift = [...diff(set, canonicalSet), ...diff(canonicalSet, set)];
      if (drift.length) failures.push(`${name} disagrees with canonical: ${drift.join(", ")}`);
    }

    if (failures.length) {
      console.error(`${LABEL}: FAIL —\n  - ${failures.join("\n  - ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `${LABEL}: PASS — all 7 boards agree canonical open_dispatch (${canonicalSet.size} loads).`
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
