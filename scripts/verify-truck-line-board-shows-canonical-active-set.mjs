#!/usr/bin/env node
/**
 * ROUND 255, UPDATED TRUCKLINE-16 (Lead, 2026-09-30) — Truck Line board shows the ONE canonical
 * DISPATCH-WORK set (not the accounting one — see canonical-active-load-set.ts's file-header
 * section "TWO CANONICAL QUESTIONS, NOT ONE"). ROUND 255's original rule (alias the accounting
 * predicate) is exactly the bug TRUCKLINE-16 fixed: a load whose driver bill got marked SETTLED
 * while the truck was still rolling silently dropped off the board.
 *
 * REQUIRES_LIVE_DB. Fails closed without DATABASE_URL.
 *
 * Asserts:
 *  1. Board SQL (truck-line.routes CURRENT helper = canonicalDispatchWorkWhereClause +
 *     assigned unit + UNIT_IN_SERVICE) returns the SAME load_number set as
 *     canonicalDispatchWorkStatusClause on mdata.loads for USMCA.
 *  2. Static: TruckLineBoard column order UNIT · TOUR · LOAD · PU · DEL.
 *  3. Static: return-trip second row keeps the unit number (data-return-trip).
 *  4. Static: universal filter + per-load status dropdown wired.
 */
import { register } from "tsx/esm/api";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRES_LIVE_DB =
  "ROUND 255 live: board row count must equal canonical active-load count; fails closed without DATABASE_URL";

register();

const LABEL = "verify-truck-line-board-shows-canonical-active-set";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

async function loadFragments() {
  const { canonicalDispatchWorkStatusClause } = await import("../apps/backend/src/dispatch/canonical-active-load-set.ts");
  const { currentTruckLineLoadSql } = await import("../apps/backend/src/dispatch/current-truck-line-load.ts");
  const { UNIT_IN_SERVICE_SQL } = await import("../apps/backend/src/dispatch/truck-line/truck-line.routes.ts");
  return { canonicalDispatchWorkStatusClause, currentTruckLineLoadSql, UNIT_IN_SERVICE_SQL };
}

function staticChecks() {
  const problems = [];
  const helper = read("apps/backend/src/dispatch/current-truck-line-load.ts");
  const board = read("apps/frontend/src/pages/dispatch/TruckLineBoard.tsx");
  const routes = read("apps/backend/src/dispatch/truck-line/truck-line.routes.ts");

  if (!/canonicalDispatchWorkWhereClause/.test(helper)) {
    problems.push("current-truck-line-load.ts must alias canonicalDispatchWorkWhereClause (TRUCKLINE-16 — dispatch-work, not accounting)");
  }
  if (/interval '48 hours'/.test(helper)) {
    problems.push("AUTH-061 48h hide must be retired from current-truck-line-load.ts (ROUND 255)");
  }
  if (!/CURRENT_TRUCK_LINE_LOAD_SQL/.test(routes) || !/canonicalDispatchWorkWhereClause|current-truck-line-load/.test(routes)) {
    problems.push("truck-line.routes.ts must still consume CURRENT_TRUCK_LINE_LOAD_SQL (now = dispatch-work canonical)");
  }

  // Column order: UNIT, TOUR, LOAD, PU, DEL — labels in that sequence in the header block.
  const header = board.match(/data-testid="truck-line-column-order"[\s\S]*?<\/div>/);
  if (!header) {
    problems.push('TruckLineBoard must render data-testid="truck-line-column-order"');
  } else {
    const labels = [...header[0].matchAll(/label="([^"]+)"/g)].map((m) => m[1]);
    // #23330 (Lead, 2026-09-30 04:12): owner, verbatim -- "TOUR / PRE-SETTLEMENT — remove
    // PRE-SETTLEMENT, just leave TOUR, so the columns can be narrower." The column still holds
    // the same value (a P-series display_id); only the header word shrank. This guard's own
    // expectation was never updated after that legitimate change, so it went stale-red rather
    // than the board being wrong -- confirmed by re-reading #23330's own diff and commit message
    // before touching this line.
    const expected = ["UNIT", "TOUR", "LOAD", "PU DATE", "DELIVERY DATE"];
    if (JSON.stringify(labels) !== JSON.stringify(expected)) {
      problems.push(`Column order wrong: got ${JSON.stringify(labels)}, want ${JSON.stringify(expected)}`);
    }
  }

  if (!/data-return-trip=\{returnTrip \? "true" : "false"\}/.test(board)) {
    problems.push("Return-trip rows must set data-return-trip");
  }
  if (!/truck-line-return-trip-/.test(board)) {
    problems.push("Return-trip second row must keep a visible unit (truck-line-return-trip testid)");
  }
  if (!/truck-line-universal-filter/.test(board)) {
    problems.push("Universal combo filter (truck-line-universal-filter) must be present");
  }
  if (!/truck-line-status-dropdown-/.test(board) || !/truck-line-status-trigger-/.test(board)) {
    problems.push("Per-load status dropdown (trigger + dropdown) must be present");
  }
  if (!/truck-line-current-location-/.test(board)) {
    problems.push("CURRENT LOCATION must render after the transit line");
  }
  if (!/onDragStatus/.test(board)) {
    problems.push("Green truck must be draggable (onDragStatus)");
  }
  if (!/#16A34A/.test(board) && !/GREEN/.test(board)) {
    problems.push("Truck graphic must use green");
  }

  return problems;
}

async function liveChecks() {
  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set (REQUIRES_LIVE_DB)`);
    process.exit(1);
  }
  const { canonicalDispatchWorkStatusClause, currentTruckLineLoadSql, UNIT_IN_SERVICE_SQL } = await loadFragments();
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const canonical = await client.query(
      `SELECT l.load_number FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND ${canonicalDispatchWorkStatusClause("l")}
        ORDER BY l.load_number`,
      [USMCA]
    );

    const board = await client.query(
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

    const cSet = canonical.rows.map((r) => r.load_number);
    const bSet = board.rows.map((r) => r.load_number);
    const onlyC = cSet.filter((n) => !bSet.includes(n));
    const onlyB = bSet.filter((n) => !cSet.includes(n));
    if (onlyC.length || onlyB.length || cSet.length !== bSet.length) {
      console.error(
        `${LABEL}: FAIL — board (${bSet.length}) != canonical (${cSet.length}). ` +
          `only_canonical=${onlyC.join(",") || "—"} only_board=${onlyB.join(",") || "—"}`
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL}: LIVE PASS — board === canonical (${cSet.length} loads: ${cSet.join(",")})`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const problems = staticChecks();
  if (problems.length) {
    console.error(`${LABEL} STATIC FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: static OK — columns / return-trip / filter / status / CURRENT LOCATION / drag`);
  await liveChecks();
}

main();
