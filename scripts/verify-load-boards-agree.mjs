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

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
register();

const LABEL = "verify-load-boards-agree";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function loadFragments() {
  const {
    canonicalActiveLoadWhereClause,
    canonicalActiveLoadNotFinishedByMoneyCte,
    canonicalDispatchWorkStatusClause,
  } = await import("../apps/backend/src/dispatch/canonical-active-load-set.ts");
  const { currentTruckLineLoadSql } = await import("../apps/backend/src/dispatch/current-truck-line-load.ts");
  const { UNIT_IN_SERVICE_SQL } = await import("../apps/backend/src/dispatch/truck-line/truck-line.routes.ts");
  return {
    canonicalActiveLoadWhereClause,
    canonicalActiveLoadNotFinishedByMoneyCte,
    canonicalDispatchWorkStatusClause,
    currentTruckLineLoadSql,
    UNIT_IN_SERVICE_SQL,
  };
}

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
    canonicalDispatchWorkStatusClause,
    currentTruckLineLoadSql,
    UNIT_IN_SERVICE_SQL,
  } = await loadFragments();
  const { default: pg } = await import("pg");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // ACCOUNTING canonical — Load Costs only.
    const canonical = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${canonicalActiveLoadWhereClause("l")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    // DISPATCH WORK canonical — every other board's reference set (TRUCKLINE-16).
    const dispatchWork = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${canonicalDispatchWorkStatusClause("l")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    // List / Kanban / Round Trips — GET /mdata/loads?board_scope=live (mdata/loads.routes.ts).
    const listLoadsLive = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${canonicalDispatchWorkStatusClause("l")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    // Load Costs — mirrors load-costs-board.routes.ts (accounting-active, money-aware).
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
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND ${canonicalDispatchWorkStatusClause("l")}
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
    const dispatchWorkSet = new Set(dispatchWork.rows.map((r) => r.load_number));
    // ACCOUNTING (money-aware) vs DISPATCH WORK (status-only) — TRUCKLINE-16. Load Costs is the
    // ONLY board answering the accounting question; every other board answers dispatch work and
    // must agree with dispatchWorkSet, never with canonicalSet.
    const accountingBoards = [["Load Costs", new Set(loadCosts.rows.map((r) => r.load_number)), canonicalSet]];
    const dispatchBoards = [
      ["GET /mdata/loads board_scope=live (List/Kanban/Round Trips)", new Set(listLoadsLive.rows.map((r) => r.load_number)), dispatchWorkSet],
      ["Trip Pairing", new Set(tripPairing.rows.map((r) => r.load_number)), dispatchWorkSet],
      ["Truck Line", new Set(truckLine.rows.map((r) => r.load_number)), dispatchWorkSet],
    ];

    const failures = [];
    const diff = (a, b) => [...a].filter((x) => !b.has(x));

    for (const [name, set, reference] of [...accountingBoards, ...dispatchBoards]) {
      const drift = [...diff(set, reference), ...diff(reference, set)];
      if (drift.length) failures.push(`${name} disagrees with its reference set: ${drift.join(", ")}`);
    }

    if (failures.length) {
      console.error(`${LABEL}: FAIL —\n  - ${failures.join("\n  - ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `${LABEL}: PASS — Load Costs agrees with the accounting canonical (${canonicalSet.size} loads); ` +
        `List/Kanban/Round Trips, Trip Pairing and Truck Line all agree with the dispatch-work canonical (${dispatchWorkSet.size} loads).`
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
