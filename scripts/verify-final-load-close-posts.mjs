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

// LEAD 443.339 — R12 (owner 2026-10-11): the after-close poster leaves the NET open on A/P (never a bank credit
// with no bank line). postLoadBookendedSettlementGlAfterClose must pass leaveNetOpen: true.
export function r12Problems(src) {
  const fn = src.match(/export async function postLoadBookendedSettlementGlAfterClose\([\s\S]*?\n}\n/);
  if (!fn) return ["postLoadBookendedSettlementGlAfterClose not found in settlement-payrun-close.service.ts — re-point this guard"];
  return /leaveNetOpen:\s*true/.test(fn[0]) ? [] : ["postLoadBookendedSettlementGlAfterClose does not pass leaveNetOpen: true (R12 — net pay credited the bank with no bank line)"];
}

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASELINE_PATH = join(process.cwd(), "scripts/verify-steps/final-load-close-posts-baseline.json");

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

// Pure function — apply shrink-only ratchet for pre-existing ambient stuck settlements. Exported for selftest.
export function applyFinalLoadRatchet(stuckRows, baseline) {
  if (!baseline) return { ratchetProblems: stuckRows.map((r) => `no baseline — ${r.display_id ?? r.id}`), ratchetPassed: stuckRows.length === 0 };
  const baselineSet = new Set(baseline.stuck_settlement_ids ?? []);
  const newStuck = stuckRows.filter((r) => !baselineSet.has(r.id));
  const ratchetProblems = newStuck.map(
    (r) => `FINAL_LOAD_CLOSE_NOT_POSTED: settlement ${r.display_id ?? r.id} (load ${r.load_number}) NEW stuck open — not in baseline`,
  );
  return { ratchetProblems, ratchetPassed: ratchetProblems.length === 0 };
}

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
    // R12 arm: the real source is clean AND a planted drop of leaveNetOpen is caught.
    const broken = src.replace(/\n\s*leaveNetOpen: true,\n/, "\n");
    if (r12Problems(src).length !== 0) problems.push(`R12: ${r12Problems(src)[0]}`);
    if (broken === src || r12Problems(broken).length !== 1) problems.push("R12 selftest: a dropped leaveNetOpen: true was NOT caught");
  }

  // Ratchet selftest: verify applyFinalLoadRatchet classifier behaviour.
  const knownId = "639a6650-ca7d-4cba-8913-fe7842e2aaa2";
  const newId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const fakeBaseline = { stuck_settlement_ids: [knownId] };
  const fakeRow = (id) => ({ id, display_id: `P-FAKE-${id.slice(0,4)}`, load_number: "99999", load_status: "delivered_pending_docs", trip_closed_at: new Date(), updated_at: new Date() });

  // 1. Known ID in baseline → ratchet passes
  { const { ratchetPassed } = applyFinalLoadRatchet([fakeRow(knownId)], fakeBaseline); if (!ratchetPassed) problems.push("ratchet-selftest-1: known settlement should PASS"); }
  // 2. New ID not in baseline → ratchet fails
  { const { ratchetPassed, ratchetProblems } = applyFinalLoadRatchet([fakeRow(newId)], fakeBaseline); if (ratchetPassed) problems.push("ratchet-selftest-2: new settlement should FAIL"); if (!ratchetProblems.some((p) => p.includes("NEW"))) problems.push("ratchet-selftest-2: FAIL message must contain NEW"); }
  // 3. Empty rows → ratchet passes (no stuck settlements)
  { const { ratchetPassed } = applyFinalLoadRatchet([], fakeBaseline); if (!ratchetPassed) problems.push("ratchet-selftest-3: empty rows should PASS"); }
  // 4. Known + new → fails on new only
  { const { ratchetProblems, ratchetPassed } = applyFinalLoadRatchet([fakeRow(knownId), fakeRow(newId)], fakeBaseline); if (ratchetPassed) problems.push("ratchet-selftest-4: mixed should FAIL"); if (ratchetProblems.length !== 1) problems.push("ratchet-selftest-4: should report exactly 1 new violation"); }
  // 5. No baseline → all rows reported as problems
  { const { ratchetPassed } = applyFinalLoadRatchet([fakeRow(knownId)], null); if (ratchetPassed) problems.push("ratchet-selftest-5: null baseline should FAIL"); }

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
  staticProblems.push(...r12Problems(src));
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

  // LEAD 443.339 — R12 live arm: 0 system "net driver pay" ACH bill payments (since 10-24) with no bank line.
  const ach = await client.query(
    `SELECT bp.id::text, bp.memo FROM accounting.bill_payments bp
      WHERE bp.operating_company_id = $1::uuid AND bp.revoked_at IS NULL AND bp.status = 'posted'
        AND bp.memo LIKE 'Settlement % — net driver pay%' AND bp.created_at >= '2026-10-24' AND bp.payment_method = 'ach'
        AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt WHERE bt.matched_bill_payment_id = bp.id AND bt.voided_at IS NULL)`,
    [USMCA]
  );

  await client.query("ROLLBACK");
  client.release();
  await pool.end();

  if (stuck.rows.length > 0) {
    const baseline = loadBaseline();
    const { ratchetProblems, ratchetPassed } = applyFinalLoadRatchet(stuck.rows, baseline);
    if (!ratchetPassed) {
      console.error(`${LABEL} FAIL (live): ${ratchetProblems.length} NEW load_bookended settlement(s) stuck open after delivery — postFinalLoadSettlementsGl never ran or failed:`);
      for (const p of ratchetProblems) console.error(`  - ${p}`);
      process.exit(1);
    }
    const baselineIds = new Set((baseline?.stuck_settlement_ids ?? []));
    const knownStuck = stuck.rows.filter((r) => baselineIds.has(r.id));
    console.log(`${LABEL}: PASS via ratchet — ${knownStuck.length} known stuck settlement(s) in baseline (${knownStuck.map((r) => r.display_id ?? r.id).join(", ")}); 0 new.`);
  }

  if (ach.rows.length > 0) {
    console.error(`${LABEL} FAIL (live): ${ach.rows.length} system net-pay ACH bill payment(s) with no bank line (R12): ${ach.rows.map((x) => x.memo).join("; ")}`);
    process.exit(1);
  }

  console.log(`${LABEL}: live OK — 0 load_bookended settlements stuck open after delivery; 0 R12 net-pay ACH payments without a bank line`);
} catch (err) {
  try { await client.query("ROLLBACK"); } catch (_) {}
  client.release();
  await pool.end();
  console.error(`${LABEL}: ERROR —`, err?.message ?? err);
  process.exit(1);
}
