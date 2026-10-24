#!/usr/bin/env node
/**
 * ENG-61 (443.336) — verify-final-load-close-posts
 *
 * RULE: every load_bookended settlement whose final load has been delivered
 * (load status in delivered_pending_docs / completed_docs_received / invoiced /
 * closed / paid) must be CLOSED (status != 'open') within a reasonable window.
 * A settlement with status='open' AND trip_closed_at IS NOT NULL is stuck in
 * the intermediate state created by the ENG-61 fix — trip was closed but GL
 * posting hasn't run yet (or failed silently). The guard catches any such row
 * that is more than 2 minutes old (avoids false positives during the brief
 * post-commit window when route handlers fire postFinalLoadSettlementsGl).
 *
 * ROOT CAUSE: before ENG-61, closeLoadBookendedSettlementForDriver set
 * status='closed' in the same UPDATE as trip_closed_at, which was rejected by
 * the trigger tg_settlement_close_requires_posting (posted_at IS NULL). The
 * UPDATE rolled back entirely, leaving settlements stuck. After ENG-61:
 * - closeLoadBookendedSettlementForDriver sets only trip_closed_at (not status)
 * - route handlers call postFinalLoadSettlementsGl AFTER their transactions commit
 * - postFinalLoadSettlementsGl → closeSettlementPayRun → sets status='closed' + posted_at atomically
 *
 * Run:
 *   node scripts/verify-final-load-close-posts.mjs
 *   node scripts/verify-final-load-close-posts.mjs --selftest
 */
import process from "node:process";
export const REQUIRES_LIVE_DB = "live-data guard; fails closed with no DATABASE_URL (ENG-61 trip-close GL posting path)";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LABEL = "verify-final-load-close-posts";
const DELIVERY_STATUSES = ["delivered_pending_docs", "completed_docs_received", "invoiced", "closed", "paid"];

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * STATIC — no DB needed. Asserts that closeLoadBookendedSettlementForDriver
 * does NOT set status='closed' in its UPDATE (which would re-trigger the ENG-61 bug),
 * and that postFinalLoadSettlementsGl is exported from settlement-payrun-close.service.ts.
 */
export function runStatic(root = process.cwd()) {
  const svc = join(root, "apps/backend/src/driver-finance/settlements-load-bookended.service.ts");
  const closer = join(root, "apps/backend/src/driver-finance/settlement-payrun-close.service.ts");

  const problems = [];

  if (!existsSync(svc)) {
    problems.push(`STATIC: ${svc} not found`);
  } else {
    const src = readFileSync(svc, "utf8");
    // The fix: UPDATE must NOT set status='closed' inside closeLoadBookendedSettlementForDriver.
    // We detect the anti-pattern: "SET trip_closed_at" block also containing "status = 'closed'"
    // within the settlement UPDATE statement.
    const updateMatch = src.match(/SET trip_closed_at[\s\S]{0,800}?WHERE id = \$1/);
    if (updateMatch && /status = 'closed'/.test(updateMatch[0])) {
      problems.push("STATIC: closeLoadBookendedSettlementForDriver still sets status='closed' in the trip_closed_at UPDATE — ENG-61 regression");
    }
  }

  if (!existsSync(closer)) {
    problems.push(`STATIC: ${closer} not found`);
  } else {
    const src = readFileSync(closer, "utf8");
    if (!/export async function postFinalLoadSettlementsGl/.test(src)) {
      problems.push("STATIC: postFinalLoadSettlementsGl is not exported from settlement-payrun-close.service.ts");
    }
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const root = process.cwd();
  const svc = join(root, "apps/backend/src/driver-finance/settlements-load-bookended.service.ts");
  const closer = join(root, "apps/backend/src/driver-finance/settlement-payrun-close.service.ts");
  const problems = [];

  if (!existsSync(svc)) {
    problems.push(`selftest cannot run: ${svc} not found (run from repo root)`);
  } else {
    const src = readFileSync(svc, "utf8");
    const updateMatch = src.match(/SET trip_closed_at[\s\S]{0,800}?WHERE id = \$1/);
    if (updateMatch && /status = 'closed'/.test(updateMatch[0])) {
      problems.push("STATIC: closeLoadBookendedSettlementForDriver still sets status='closed' — ENG-61 regression");
    }
    if (!/ENG-61/.test(src)) {
      problems.push("STATIC: ENG-61 fix comment not found in settlements-load-bookended.service.ts");
    }
  }

  if (!existsSync(closer)) {
    problems.push(`selftest cannot run: ${closer} not found`);
  } else {
    const src = readFileSync(closer, "utf8");
    if (!/export async function postFinalLoadSettlementsGl/.test(src)) {
      problems.push("STATIC: postFinalLoadSettlementsGl not exported from settlement-payrun-close.service.ts");
    }
  }

  if (problems.length) {
    for (const p of problems) console.error(`${LABEL} --selftest FAIL: ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

// ── Static half ─────────────────────────────────────────────────────────────────────────────────
const root = process.cwd();
const svc = join(root, "apps/backend/src/driver-finance/settlements-load-bookended.service.ts");
const closer = join(root, "apps/backend/src/driver-finance/settlement-payrun-close.service.ts");
const staticProblems = [];

if (!existsSync(svc)) {
  staticProblems.push(`${svc} not found`);
} else {
  const src = readFileSync(svc, "utf8");
  const updateMatch = src.match(/SET trip_closed_at[\s\S]{0,800}?WHERE id = \$1/);
  if (updateMatch && /status = 'closed'/.test(updateMatch[0])) {
    staticProblems.push("closeLoadBookendedSettlementForDriver still sets status='closed' in the trip_closed_at UPDATE — ENG-61 regression");
  }
}

if (!existsSync(closer)) {
  staticProblems.push(`${closer} not found`);
} else {
  const src = readFileSync(closer, "utf8");
  if (!/export async function postFinalLoadSettlementsGl/.test(src)) {
    staticProblems.push("postFinalLoadSettlementsGl is not exported from settlement-payrun-close.service.ts");
  }
}

if (staticProblems.length) {
  for (const p of staticProblems) console.error(`${LABEL} FAIL (static): ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: static OK — closeLoadBookendedSettlementForDriver does not set status='closed', postFinalLoadSettlementsGl exported`);

// ── Live half ────────────────────────────────────────────────────────────────────────────────────
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set. A live money guard that cannot connect is a FAIL (ROUND 29.9-B).`);
  process.exit(1);
}

const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("RESET ROLE");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

  // Check DB is populated with USMCA data before asserting anything.
  const present = await client.query(
    `SELECT count(*)::int AS n FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  if ((present.rows[0]?.n ?? 0) === 0) {
    await client.query("ROLLBACK");
    console.log(`${LABEL}: SKIP (live) — no USMCA driver_settlements found, nothing to assert`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  // Find load_bookended settlements that are stuck: status='open', trip_closed_at IS NOT NULL,
  // AND their last load is in a delivered/past-delivery status.
  // 2-minute grace period: a settlement updated in the last 2 minutes may still be processing.
  const stuck = await client.query(
    `
      SELECT
        ds.id::text,
        ds.display_id,
        ds.status,
        ds.trip_closed_at,
        ds.last_load_id::text,
        l.load_number,
        l.status::text AS load_status,
        ds.updated_at
      FROM driver_finance.driver_settlements ds
      LEFT JOIN mdata.loads l ON l.id = ds.last_load_id
      WHERE ds.operating_company_id = $1::uuid
        AND ds.settlement_model = 'load_bookended'
        AND ds.status = 'open'
        AND ds.trip_closed_at IS NOT NULL
        AND ds.voided_at IS NULL
        AND l.status::text = ANY($2::text[])
        AND ds.updated_at < now() - interval '2 minutes'
    `,
    [USMCA, DELIVERY_STATUSES]
  );

  await client.query("ROLLBACK");
  client.release();
  await pool.end();

  if (stuck.rows.length > 0) {
    console.error(`${LABEL} FAIL (live): ${stuck.rows.length} load_bookended settlement(s) stuck open after delivery — postFinalLoadSettlementsGl never ran or failed:`);
    for (const r of stuck.rows) {
      console.error(`  - settlement ${r.display_id ?? r.id} (load ${r.load_number}, load_status=${r.load_status}, trip_closed_at=${r.trip_closed_at}, updated=${r.updated_at})`);
    }
    process.exit(1);
  }

  console.log(`${LABEL}: live OK — 0 load_bookended settlements stuck open after delivery`);
} catch (err) {
  try { await client.query("ROLLBACK"); } catch (_) {}
  client.release();
  await pool.end();
  console.error(`${LABEL}: ERROR —`, err?.message ?? err);
  process.exit(1);
}
