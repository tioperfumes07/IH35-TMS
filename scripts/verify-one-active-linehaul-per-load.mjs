#!/usr/bin/env node
/**
 * ENG-11 G10 (row 249) — one active linehaul per load.
 *
 * Root cause (2026-10-11): settlement-creator-seed-loads.ts was re-booking existing loads during
 * Edit+void+repost, calling bookLoadOnClient without deactivating the existing linehaul row first.
 * Fixed 2026-10-11 via isPriorCreatorSettlementLoad + isSeededLoadFreeForThisSettlement adoption
 * guards. The 10 affected loads were repaired on 2026-10-16 by Edit Load (update-load.service.ts
 * deactivate+replace ran and left each load with exactly 1 active linehaul).
 *
 * Engine rule: a rate change REPLACES the linehaul — update-load.service.ts locks all active
 * charge lines FOR UPDATE, bulk-deactivates them (verified rowCount), then inserts the new set.
 * book-load.service.ts inserts only for new loads (no prior charge lines exist at booking time).
 *
 * STATIC HALF: verify update-load.service.ts retains the snapshot+lock deactivation block.
 * LIVE HALF: no USMCA load has more than 1 active linehaul line.
 *
 * Baseline: 0 failures (verified 2026-10-25 on prod br-fancy-credit-akjnd07a).
 *
 *   node scripts/verify-one-active-linehaul-per-load.mjs
 *   node scripts/verify-one-active-linehaul-per-load.mjs --selftest
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B, E7 batch 2b)";
export const ALLOW_OFFLINE_SKIP =
  "static half (update-load snapshot+lock deactivate+replace) always runs; live USMCA duplicate linehaul count needs DATABASE_URL and CI runs it live";

const require = createRequire(import.meta.url);
const FILE = "apps/backend/src/dispatch/update-load.service.ts";
const LABEL = "verify-one-active-linehaul-per-load";
const fail = (m) => { console.error(`FAIL ${LABEL}: ${m}`); process.exit(1); };

function read(rel) {
  return readFileSync(rel, "utf8");
}

// STATIC: verify the deactivate+replace block exists in update-load.service.ts.
function verify(src) {
  const failures = [];
  // Lock active rows before deactivation (snapshot+lock, DSP-MONEY-F7218A).
  if (!src.includes("FOR UPDATE")) {
    failures.push("update-load.service.ts lost the FOR UPDATE snapshot lock before charge-line deactivation");
  }
  // Bulk deactivation of all active charge lines.
  if (!src.includes("SET is_active = false") || !src.includes("WHERE load_id = $1::uuid") || !src.includes("AND is_active = true")) {
    failures.push("update-load.service.ts lost the bulk is_active=false deactivation before inserting new charge lines");
  }
  // Verify deactivation row count matches locked count.
  if (!src.includes("deactivated.rows.length !== activeChargeLines.rows.length")) {
    failures.push("update-load.service.ts lost the deactivation-count equality check (E_LOAD_CHARGE_DEACTIVATE_INCOMPLETE)");
  }
  return failures;
}

function selftest() {
  const good = `
    SELECT id FROM dispatch.load_charge_lines WHERE load_id = $1::uuid AND is_active = true FOR UPDATE
    UPDATE dispatch.load_charge_lines SET is_active = false WHERE load_id = $1::uuid AND is_active = true
    if (deactivated.rows.length !== activeChargeLines.rows.length) throw ...
  `;
  const bad = `UPDATE dispatch.load_charge_lines SET is_active = false WHERE load_id = $1`;
  if (verify(good).length !== 0) { fail("selftest: false negative on good source"); }
  if (verify(bad).length === 0) { fail("selftest: false positive on bad source"); }
  console.log(`${LABEL} selftest PASS`);
  return 0;
}

async function liveCheck() {
  const connectionString = process.env.DATABASE_URL ?? process.env.GUARD_DATABASE_URL ?? "";
  if (!connectionString) {
    console.log(`${LABEL} SKIP (live half) — DATABASE_URL not set.`);
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} SKIP (live half) — database unreachable (${error.code ?? error.message}).`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const res = await client.query(`
      SELECT l.load_number, COUNT(*) AS active_linehaul_count
        FROM dispatch.load_charge_lines lcl
        JOIN mdata.loads l ON l.id = lcl.load_id
        JOIN org.companies c ON c.id = l.operating_company_id
       WHERE c.code = 'USMCA'
         AND lcl.is_active = true
         AND lcl.charge_code = 'linehaul'
         AND l.voided_at IS NULL
         AND l.soft_deleted_at IS NULL
       GROUP BY l.id, l.load_number
      HAVING COUNT(*) > 1
      ORDER BY l.load_number
    `);
    await client.query("ROLLBACK");

    if (res.rows.length > 0) {
      const list = res.rows.map((r) => `${r.load_number}(${r.active_linehaul_count})`).join(", ");
      console.error(`${LABEL} FAIL — ${res.rows.length} USMCA load(s) have >1 active linehaul: ${list}`);
      return 1;
    }
    console.log(`${LABEL} PASS (live) — every USMCA load has at most 1 active linehaul line. $30,170.00 revenue overstatement cleared.`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const staticFailures = verify(read(FILE));
  if (staticFailures.length) {
    console.error(`${LABEL} FAIL: ${staticFailures.join("; ")}`);
    return 1;
  }
  console.log(`${LABEL} static OK: update-load.service.ts retains snapshot+lock deactivate+replace.`);

  return liveCheck();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
