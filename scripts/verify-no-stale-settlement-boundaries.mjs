#!/usr/bin/env node
/**
 * Row 84 (443.260 LEAD, CC-2, step 18807) — no USMCA settlement may have
 * first_load_id = last_load_id while its active lines name 2+ distinct loads.
 *
 * ROOT CAUSE (2026-10-23, prod): repairReassignedPresettlementBoundaries and the
 * pre-settlement link each incremented boundaries by COALESCE rather than deriving them
 * from the settlement's own lines. Five settlements (P-0105/0107/0108/0109/0115) read
 * first_load_id = last_load_id while their lines named 2–3 loads.
 *
 * CODE FIX: settlement-boundaries.service.ts is the ONE engine allowed to write
 * first_load_id/last_load_id (enforced by verify-settlement-boundary-writers.mjs).
 * The owner-only repair route and the ops script (AUTH-454) both call
 * rederiveSettlementBoundariesInClientTx via settlement-header-repair.service.ts.
 *
 * STATIC: settlement-header-repair.service.ts still exports STALE_SETTLEMENT_HEADERS_SQL
 * and calls rederiveSettlementBoundariesInClientTx.
 *
 * LIVE: shrink-only ratchet, ceiling 0 (prod repaired 2026-10-25 via AUTH-454).
 *
 *   node scripts/verify-no-stale-settlement-boundaries.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP =
  "static half (repair-service checks) runs without DB; live half skips when DATABASE_URL absent — boundary metadata, not money amounts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-stale-settlement-boundaries";
const CEILING = 0; // repaired to 0 on 2026-10-25 via AUTH-454
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const REPAIR_SERVICE =
  "apps/backend/src/driver-finance/settlement-header-repair.service.ts";

export function staticFailures() {
  const f = [];
  const src = readFileSync(resolve(ROOT, REPAIR_SERVICE), "utf8");
  if (!/\bSTALE_SETTLEMENT_HEADERS_SQL\b/.test(src)) {
    f.push(
      `${REPAIR_SERVICE}: STALE_SETTLEMENT_HEADERS_SQL removed — the SQL that detects first_load_id=last_load_id staleness is gone`
    );
  }
  if (!/rederiveSettlementBoundariesInClientTx/.test(src)) {
    f.push(
      `${REPAIR_SERVICE}: rederiveSettlementBoundariesInClientTx removed — the boundary engine that repairs stale headers is no longer invoked`
    );
  }
  return f;
}

if (process.argv.includes("--selftest")) {
  const clean = staticFailures();
  if (clean.length) {
    console.error("SELFTEST FAIL: baseline static should pass:", clean);
    process.exit(1);
  }
  // Plant: rename the SQL export so it fails
  const src = readFileSync(resolve(ROOT, REPAIR_SERVICE), "utf8");
  const planted = src.replace(
    /STALE_SETTLEMENT_HEADERS_SQL/g,
    "STALE_SETTLEMENT_HEADERS_SQL_OLD"
  );
  const { writeFileSync } = await import("node:fs");
  writeFileSync(resolve(ROOT, REPAIR_SERVICE), planted);
  let fail;
  try {
    fail = staticFailures();
  } finally {
    writeFileSync(resolve(ROOT, REPAIR_SERVICE), src);
  }
  if (!fail.length) {
    console.error(
      "SELFTEST FAIL: removing STALE_SETTLEMENT_HEADERS_SQL should fail static check"
    );
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = staticFailures();

const connectionString =
  process.env.DATABASE_DIRECT_URL ||
  process.env.DATABASE_URL ||
  process.env.GUARD_DATABASE_URL ||
  "";

if (!connectionString) {
  console.log(
    `${LABEL}: SKIP (live half) — DATABASE_URL not set. Declared ALLOW_OFFLINE_SKIP: ${ALLOW_OFFLINE_SKIP}`
  );
} else {
  const require = createRequire(import.meta.url);
  const pg = require("pg");
  const pgOpts = require("./lib/pg-connection-options.cjs");
  const config =
    typeof pgOpts.buildPgClientConfig === "function"
      ? pgOpts.buildPgClientConfig(connectionString)
      : { connectionString, ssl: { rejectUnauthorized: false } };
  const client = new pg.Client(config);
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const r = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM driver_finance.driver_settlements s
        WHERE s.operating_company_id = $1::uuid
          AND s.voided_at IS NULL
          AND s.first_load_id = s.last_load_id
          AND (
            SELECT COUNT(DISTINCT sl.load_id)
              FROM driver_finance.settlement_lines sl
             WHERE sl.settlement_id = s.id
               AND sl.operating_company_id = s.operating_company_id
               AND sl.is_active = true
               AND sl.voided_at IS NULL
               AND sl.load_id IS NOT NULL
          ) >= 2`,
      [USMCA]
    );
    await client.query("ROLLBACK");
    const count = Number(r.rows[0]?.n ?? 0);
    if (count > CEILING) {
      failures.push(
        `${count} USMCA settlement(s) have first_load_id=last_load_id while active lines name 2+ loads ` +
          `(ceiling ${CEILING}) — run scripts/ops/2026-10-23-cc2-443-260-rederive-settlement-headers.mts with OWNER_AUTH_ID=AUTH-454`
      );
    }
    console.log(
      `${LABEL}: LIVE — ${count} stale settlement boundary/ies (ceiling ${CEILING})`
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    failures.push(`DB check failed: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

if (failures.length) {
  console.error(`${LABEL}: FAIL (${failures.length}):`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — repair-service exports intact; live stale-boundary count ≤ ${CEILING}`
);
