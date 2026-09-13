#!/usr/bin/env node
// LOAD-TO-CASH CHAIN — OWNER LAW, VERBATIM (2026-09-12): "the instant a load is booked, a bill
// must be created automatically for that driver for that load. that load ... must automatically be
// assigned to a pre-settlement/settlement/tour. all expenses that are related to that load have the
// same expense number as the load and all bills related to that load." A feature that does not
// carry the load's identity forward is NOT DONE.
//
// Three checks, all against LIVE Neon (bypass_rls='lucia' — these are cross-entity/company reads by
// design, not a single-tenant RLS-scoped read):
//   LINK 2 (presettlement/tour link) — a non-cancelled load older than 24h with
//     mdata.loads.presettlement_link_id IS NULL. HARD FAIL. Verified live against the Lead's own
//     88-load chain audit: this exact WHERE clause + column reproduced 74/88 exactly.
//   LINK 3 (expense_number off the load) — accounting.expenses with a non-null load_id whose
//     expense_number does not start with that load's load_number. HARD FAIL — the Lead's own
//     measurement found this ALREADY at 385/385 and said "DO NOT TOUCH IT... any refactor that
//     weakens this is a regression." This check is what keeps it there.
//   LINK 1 (driver bill) — REPORTED, NOT FAILED, in this version. accounting.bills has no load_id
//     column at all (confirmed via a full schema read), so "load -> driver bill" can only be
//     reached indirectly, and the exact path the Lead's own 81/88 figure used could not be
//     reproduced live during authoring (the obvious candidate join —
//     driver_finance.driver_settlements.accounting_bill_id via presettlement_link_id — was
//     attempted but the live connection was too unstable this session to get a confirmed,
//     reproducible match to 81/88; two consecutive identical queries returned 88 and then 0 total
//     rows with no code change). Shipping a HARD FAIL on an unverified join risks blocking every
//     other seat's push on a guard that is wrong by construction — worse than not having it yet.
//     Reported here as a metric so it's visible; promote to HARD FAIL once Cursor/CC-1 confirm the
//     real linkage column (Cursor owns the auto-create hook this check protects).
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
        COUNT(*) FILTER (WHERE presettlement_link_id IS NULL)::int AS missing_presettlement
      FROM mdata.loads
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

    // LINK 1 — reported only, see header. Best-available hypothesis join; unverified live this
    // session (connection instability, not a query error). Never gates the build.
    let link1Note = "LINK 1 (driver bill) — SKIPPED (join unverified live, see header comment)";
    try {
      const billRes = await client.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM driver_finance.driver_settlements s
              WHERE s.id = mdata_loads.presettlement_link_id AND s.accounting_bill_id IS NOT NULL
            )
          )::int AS via_settlement_bill
        FROM mdata.loads AS mdata_loads
        WHERE soft_deleted_at IS NULL
          AND status <> 'cancelled'
          AND created_at < now() - interval '24 hours'
      `);
      const bill = billRes.rows[0];
      if (bill && bill.total !== "0") {
        link1Note = `LINK 1 (driver bill, via settlement.accounting_bill_id — UNCONFIRMED join) — ${bill.via_settlement_bill} of ${bill.total} reported, informational only`;
      }
    } catch {
      // Leave the SKIPPED note — never fail the build on an experimental, non-gating query.
    }

    if (failures.length > 0) {
      console.error(`${LABEL}: LIVE FAIL`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      console.error(`  (${link1Note})`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — ${chain.total} eligible load(s), 0 missing presettlement_link_id, 0 expense_number mismatches. ${link1Note}`);
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
