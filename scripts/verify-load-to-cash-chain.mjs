#!/usr/bin/env node
// LOAD-TO-CASH CHAIN — OWNER LAW, VERBATIM (2026-09-12): "the instant a load is booked, a bill
// must be created automatically for that driver for that load. that load ... must automatically be
// assigned to a pre-settlement/settlement/tour. all expenses that are related to that load have the
// same expense number as the load and all bills related to that load." A feature that does not
// carry the load's identity forward is NOT DONE.
//
// Three HARD-FAIL checks, all against LIVE Neon (bypass_rls='lucia' — these are cross-entity/
// company reads by design, not a single-tenant RLS-scoped read):
//   LINK 1 (driver bill) — driver_finance.driver_bills.load_id (NOT accounting.bills, which has no
//     load_id column at all — that was this guard's own first-draft mistake, corrected by the Lead
//     2026-09-13: "THAT IS THE WRONG TABLE. My figure came from driver_finance.driver_bills.load_id").
//     Live-verified this exact query reproduces 81/88 exactly, unfiltered by driver_bills.status —
//     adding a status filter was tried and it under-counts (74/88), so this stays a bare EXISTS.
//   LINK 2 (presettlement/tour link) — mdata.loads.presettlement_link_id IS NULL. Live-verified to
//     reproduce 74/88 exactly.
//   LINK 3 (expense_number off the load) — accounting.expenses with a non-null load_id whose
//     expense_number does not start with that load's load_number. The Lead's own measurement found
//     this ALREADY at 385/385 and said "DO NOT TOUCH IT... any refactor that weakens this is a
//     regression." This check is what keeps it there.
// All three scoped identically: non-cancelled, non-soft-deleted, older than 24h.
//
// Skips gracefully (prints, exits 0) when DATABASE_URL is not set — same convention every other
// live-Neon guard in this repo uses, so a coder without a live connection configured is never
// blocked locally; CI / a session with the real connection string sees the real check.
import pg from "pg";

const LABEL = "verify-load-to-cash-chain";

export function expenseNumberMismatch(loadNumber, expenseNumber) {
  if (!expenseNumber) return false; // no expense_number at all is a separate, pre-existing gap class, not this check's concern
  if (!loadNumber) return true; // an expense claims a load_id but that load has no number to derive from — can't possibly match
  return !expenseNumber.startsWith(loadNumber);
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`${LABEL}: LIVE skipped (no DATABASE_URL) — not a pass, not a fail; this check needs a real Neon connection`);
    return;
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const chainRes = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE presettlement_link_id IS NULL)::int AS missing_presettlement,
        COUNT(*) FILTER (
          WHERE NOT EXISTS (SELECT 1 FROM driver_finance.driver_bills db WHERE db.load_id = l.id)
        )::int AS missing_driver_bill
      FROM mdata.loads l
      WHERE soft_deleted_at IS NULL
        AND status <> 'cancelled'
        AND created_at < now() - interval '24 hours'
    `);
    const chain = chainRes.rows[0];
    if (!chain || chain.total === "0") {
      console.error(`${LABEL}: LIVE FAIL — 0 eligible loads found; completeness discriminator says this is an instrument problem, not a real zero (see verify-zero-count-completeness-discriminator convention) — re-run before trusting this`);
      process.exit(1);
    }

    const failures = [];
    if (Number(chain.missing_driver_bill) > 0) {
      failures.push(
        `LINK 1 — ${chain.missing_driver_bill} of ${chain.total} non-cancelled load(s) older than 24h have no driver_finance.driver_bills row (no driver bill auto-created)`
      );
    }
    if (Number(chain.missing_presettlement) > 0) {
      failures.push(
        `LINK 2 — ${chain.missing_presettlement} of ${chain.total} non-cancelled load(s) older than 24h have no presettlement_link_id (no pre-settlement/settlement/tour assignment)`
      );
    }

    const expenseRes = await client.query(`
      SELECT e.expense_number, l.load_number
      FROM accounting.expenses e
      JOIN mdata.loads l ON l.id = e.load_id
      WHERE e.load_id IS NOT NULL
        AND e.voided_at IS NULL
    `);
    const mismatches = expenseRes.rows.filter((r) => expenseNumberMismatch(r.load_number, r.expense_number));
    if (mismatches.length > 0) {
      failures.push(
        `LINK 3 — ${mismatches.length} of ${expenseRes.rows.length} load-linked expense(s) have an expense_number that does not begin with their load's load_number (e.g. ${mismatches[0].expense_number} on load ${mismatches[0].load_number}) — this was measured at 385/385 correct; any regression here is a real defect`
      );
    }

    if (failures.length > 0) {
      console.error(`${LABEL}: LIVE FAIL`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: LIVE PASS — ${chain.total} eligible load(s), 0 missing driver_bills row, 0 missing presettlement_link_id, 0 expense_number mismatches.`
    );
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  assert.equal(expenseNumberMismatch("13565", "13565-3"), false, "a load-derived expense_number must pass");
  assert.equal(expenseNumberMismatch("13565", "13565"), false, "an exact-match expense_number must pass");
  assert.equal(expenseNumberMismatch("13565", "99999-1"), true, "an expense_number not derived from its load must fail");
  assert.equal(expenseNumberMismatch("13565", null), false, "no expense_number at all is a different gap class, not this check");
  assert.equal(expenseNumberMismatch(null, "13565-3"), true, "an expense_number with no load_number to derive from cannot pass");
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

await live();
