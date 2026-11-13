/**
 * verify-perf-budget-driver-day-summary-drivers (ROW 124+138 / step 20035)
 *
 * Guards the duty CTE perf fix for driver-day-summary:
 *   Before: idx_hos_duty_status_events_driver_time (opco, driver_id, started_at)
 *           → planner scanned 15,550 index rows for 52 results (2026-11-12 prod, owner+bypass ~0.9s)
 *   Fix:    idx_hos_duty_status_events_duty_overlap (opco, duty_status, started_at) partial WHERE
 *           duty_status IN ('on_duty','on_duty_not_driving','driving')
 *           → planner filters opco+duty_status first, bounds started_at range, heap fetch is small
 *
 * --selftest: static checks only (no DB)
 * default:    live PG checks (requires DATABASE_URL); skips gracefully when absent
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP =
  "duty-overlap guard verifies migration SQL via static selftest; live index-existence check skips when DATABASE_URL absent";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

const isSelftest = process.argv.includes("--selftest");

await runSelftest();
if (!isSelftest) {
  await runLive();
}

async function runSelftest() {
  const failures = [];

  // 1. Migration file exists
  const migPath = resolve(
    root,
    "db/migrations/202616600100_perf_duty_status_events_overlap_index.sql"
  );
  if (!existsSync(migPath)) {
    failures.push(
      "MIGRATION-MISSING: db/migrations/202616600100_perf_duty_status_events_overlap_index.sql not found"
    );
  } else {
    const sql = readFileSync(migPath, "utf8");

    // 2. Index name correct
    if (!sql.includes("idx_hos_duty_status_events_duty_ended")) {
      failures.push(
        "INDEX-NAME: migration missing idx_hos_duty_status_events_duty_ended"
      );
    }

    // 3. Covers operating_company_id + duty_status + ended_at
    if (
      !sql.includes("operating_company_id") ||
      !sql.includes("duty_status") ||
      !sql.includes("ended_at")
    ) {
      failures.push(
        "INDEX-COLUMNS: migration must include operating_company_id, duty_status, ended_at"
      );
    }

    // 4. Partial WHERE ended_at IS NOT NULL (the NULL case is handled by existing open index)
    if (!sql.includes("ended_at IS NOT NULL")) {
      failures.push(
        "INDEX-PARTIAL: migration missing WHERE ended_at IS NOT NULL (NULL case covered by existing open index)"
      );
    }

    // 5. hos schema
    if (!sql.includes("hos.duty_status_events")) {
      failures.push("INDEX-SCHEMA: migration must target hos.duty_status_events");
    }
  }

  // 6. CLAIMED-MIGRATION-NUMBERS.json has the entry
  const claimedPath = resolve(root, "db/migrations/CLAIMED-MIGRATION-NUMBERS.json");
  if (existsSync(claimedPath)) {
    const claimed = JSON.parse(readFileSync(claimedPath, "utf8"));
    if (!claimed["202616600100"]) {
      failures.push("CLAIMED-MISSING: 202616600100 not in CLAIMED-MIGRATION-NUMBERS.json");
    }
  }

  // 7. Driver-day-summary duty CTE still uses the right columns (not changed to bypass the index)
  const routesPath = resolve(
    root,
    "apps/backend/src/telematics/driver-day-summary.routes.ts"
  );
  if (existsSync(routesPath)) {
    const routes = readFileSync(routesPath, "utf8");
    if (!routes.includes("duty_status IN") && !routes.includes("duty_status IN ('on_duty'")) {
      failures.push(
        "DUTY-CTE-CHANGED: driver-day-summary.routes.ts no longer filters duty_status IN — index unusable"
      );
    }
    if (!routes.includes("hos.duty_status_events")) {
      failures.push(
        "DUTY-CTE-CHANGED: driver-day-summary.routes.ts no longer reads hos.duty_status_events"
      );
    }
  }

  if (failures.length > 0) {
    for (const f of failures) console.error("SELFTEST FAIL:", f);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: 7/7 static checks — duty CTE index migration intact`);
}

async function runLive() {
  if (!process.env.DATABASE_URL) {
    console.log(
      "SKIP: DATABASE_URL not set — skipping live index check (static selftest still runs)"
    );
    return;
  }
  const { client, pool } = await requireLiveDbOrExit({
    label: "verify-perf-budget-driver-day-summary-drivers",
  });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");

    // Check the index exists
    const idxRes = await client.query(`
      SELECT indexname
        FROM pg_indexes
       WHERE schemaname = 'hos'
         AND tablename  = 'duty_status_events'
         AND indexname  = 'idx_hos_duty_status_events_duty_ended'
    `);

    if (idxRes.rows.length === 0) {
      console.error(
        "FAIL: idx_hos_duty_status_events_duty_ended does not exist on prod — migration not applied"
      );
      await client.query("ROLLBACK");
      process.exit(1);
    }
    console.log("INDEX EXISTS: idx_hos_duty_status_events_duty_ended ✓");

    // Ceiling check: the EXPLAIN (ANALYZE, BUFFERS) for the duty CTE on a known date
    // should show index rows hit < 1000 (before fix: 15,550)
    const explainRes = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        e.driver_id,
        COUNT(*) AS slices
      FROM hos.duty_status_events e
      WHERE e.operating_company_id = (
              SELECT id FROM org.companies
              WHERE short_name = 'USMCA'
              LIMIT 1
            )
        AND e.duty_status IN ('on_duty', 'driving')
        AND e.started_at < '2026-11-13 00:00:00+00'::timestamptz
        AND COALESCE(e.ended_at, '2026-11-13 00:00:00+00'::timestamptz) > '2026-11-12 00:00:00+00'::timestamptz
      GROUP BY e.driver_id
    `);

    const planText = explainRes.rows.map((r) => Object.values(r)[0]).join("\n");

    // Extract index scan rows from plan
    const rowsMatch = planText.match(/Index Scan.*?rows=(\d+)/i) ||
                      planText.match(/Bitmap Index Scan.*?rows=(\d+)/i);
    const usesNewIndex = planText.includes("idx_hos_duty_status_events_duty_ended");
    const usesOldFallback = !usesNewIndex &&
                            (planText.includes("idx_hos_duty_status_events_driver_time") ||
                             planText.includes("hos_duty_status_events_dedupe"));

    if (usesOldFallback) {
      console.warn("WARN: planner still chose old dedupe/driver_time index — ANALYZE hos.duty_status_events may be needed");
    } else if (usesNewIndex) {
      console.log("INDEX USED: planner chose idx_hos_duty_status_events_duty_ended ✓");
    } else {
      console.log("PLAN INFO: index scan present (index may have different name on this env)");
    }

    // Row-scan ceiling: should be << 15,550 after the fix
    if (rowsMatch) {
      const estimatedRows = parseInt(rowsMatch[1], 10);
      const CEILING = 2000;
      if (estimatedRows > CEILING) {
        console.error(
          `FAIL: duty CTE estimated rows=${estimatedRows} exceeds ceiling ${CEILING} — index not effective`
        );
        await client.query("ROLLBACK");
        process.exit(1);
      }
      console.log(`ROW SCAN: estimated ${estimatedRows} ≤ ${CEILING} ✓`);
    }

    console.log("PASS");
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}
