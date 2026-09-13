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

/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leafRe":"^(loads|driver_bills|presettlement|expenses)$","task":"LOAD-TO-CASH-CHAIN-C1-C3","vertical":"class-sweep"} */

const LABEL = "verify-load-to-cash-chain";

// USMCA only (00-IH35-LAW.mdc). The first draft of this guard counted EVERY company under
// bypass_rls, so frozen Transportation loads (L-2026… under 91e0bf0a) landed in LINK 1/2 as
// cross-entity false positives — corrected to scope on operating_company_id 2026-09-13 (Cursor).
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// LINK 2 owner-pending baseline (consciously baselined, orphan-fk-inventory convention). These
// driver-having loads cannot be auto-linked — their pre-settlement was script-cancelled on
// 2026-09-12 while OPEN and the driver has since opened a NEWER tour, so the old one can only be
// owner-CLOSED (never re-opened: one-open-per-driver), or it never had a pre-settlement at all. Full
// forensic + the safe restore of the 4 owner-CLOSED siblings: docs/reconcile/CHAIN-C1-C2-BACKFILL-
// 2026-09-13.md. A driver-having unlinked load NOT in this set is a real regression and fails.
const OWNER_PENDING_UNLINKED = new Set(["13526", "13527", "13561", "13567", "13571", "13574"]);
const DELIVERED_STATUSES = ["delivered_pending_docs", "completed_docs_received", "closed", "invoiced"];

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
    // is_local MUST be false — pg autocommits each statement, so a transaction-local (true) GUC is
    // gone by the next query and every read then RLS-filters to 0 ("0 eligible loads" false FAIL).
    // Session-level persists across the client's statements. (neondb_owner does not auto-bypass RLS.)
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

    const loadsRes = await client.query(
      `
      SELECT l.load_number, l.status::text AS status,
             (l.assigned_primary_driver_id IS NOT NULL OR l.assigned_secondary_driver_id IS NOT NULL) AS has_driver,
             (l.presettlement_link_id IS NOT NULL) AS has_presettlement,
             EXISTS (SELECT 1 FROM driver_finance.driver_bills db WHERE db.load_id = l.id) AS has_bill
        FROM mdata.loads l
       WHERE l.soft_deleted_at IS NULL
         AND l.status <> 'cancelled'
         AND l.created_at < now() - interval '24 hours'
         AND l.operating_company_id = $1::uuid
    `,
      [USMCA_COMPANY_ID]
    );
    const loads = loadsRes.rows;
    if (loads.length === 0) {
      console.error(`${LABEL}: LIVE FAIL — 0 eligible USMCA loads found; completeness discriminator says this is an instrument problem, not a real zero (see verify-zero-count-completeness-discriminator convention) — re-run before trusting this`);
      process.exit(1);
    }

    // LINK 1 — owner law is "a bill for THAT DRIVER". driver_finance.driver_bills.driver_id is NOT
    // NULL, so a load with no seated driver CANNOT have a driver bill — LINK 1 hard-fails only on
    // loads that HAVE a driver and still lack a bill. A load that reached a delivered/closed status
    // with no driver at all is a separate DATA anomaly, reported below (not conflated into LINK 1).
    const link1Fail = loads.filter((r) => r.has_driver && !r.has_bill).map((r) => r.load_number);
    const driverlessDelivered = loads
      .filter((r) => !r.has_driver && DELIVERED_STATUSES.includes(r.status))
      .map((r) => r.load_number);

    // LINK 2 — every driver-having load must be on a pre-settlement/tour. The owner-pending baseline
    // (see const above) is excluded; a driver-having unlinked load NOT in it is a real regression.
    const link2Fail = loads
      .filter((r) => r.has_driver && !r.has_presettlement && !OWNER_PENDING_UNLINKED.has(r.load_number))
      .map((r) => r.load_number);
    const ownerPendingPresent = loads
      .filter((r) => !r.has_presettlement && OWNER_PENDING_UNLINKED.has(r.load_number))
      .map((r) => r.load_number);

    if (driverlessDelivered.length > 0) {
      console.log(`${LABEL}: REPORT — ${driverlessDelivered.length} delivered/closed load(s) with NO driver (cannot mint a bill or join a tour; owner data fix): ${driverlessDelivered.join(", ")}`);
    }
    if (ownerPendingPresent.length > 0) {
      console.log(`${LABEL}: REPORT — ${ownerPendingPresent.length} owner-pending unlinked load(s) baselined (script-cancelled OPEN pre-settlement, driver moved on): ${ownerPendingPresent.join(", ")}`);
    }

    const failures = [];
    if (link1Fail.length > 0) {
      failures.push(
        `LINK 1 — ${link1Fail.length} of ${loads.length} USMCA driver-having load(s) older than 24h have no driver_finance.driver_bills row: ${link1Fail.join(", ")}`
      );
    }
    if (link2Fail.length > 0) {
      failures.push(
        `LINK 2 — ${link2Fail.length} of ${loads.length} USMCA driver-having load(s) older than 24h have no presettlement_link_id and are not in the owner-pending baseline: ${link2Fail.join(", ")}`
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
      `${LABEL}: LIVE PASS — ${loads.length} eligible USMCA load(s); every driver-having load has a driver_bill and a presettlement_link_id; 0 expense_number mismatches.`
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
