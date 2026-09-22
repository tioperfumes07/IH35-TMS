#!/usr/bin/env node
// Lead ruling, 4-of-4 (2026-09-22, docs/bus/INBOX-CC-1.md): "THE txn_% FUEL GUARD AS A
// SHRINK-ONLY RATCHET, BASELINE 76. 76 rows exist today. Ship it as a hard zero and you
// freeze every push exactly like parity is doing now."
//
// WHAT "txn_%" IS: USMCA fuel.fuel_transactions rows whose transaction_reference still
// carries the RAW Relay bridge token (e.g. "txn_D65tDbfFqky6b9") instead of a real,
// vendor-matched reference. CC-1 live-verified 2026-09-23 (bypass_rls=lucia, same WHERE
// this guard uses): all 76 carry `relay_bridge=1` in notes; 75 of 76 have vendor_id IS
// NULL / `vendor_unmatched=1` in notes (the merchant -- Love's, in every sampled row --
// was ingested from Relay but never linked to a canonical mdata.vendors row); the
// remaining 1 has since been vendor-matched but its transaction_reference was never
// rekeyed off the raw Relay token, so it still counts. Deliberately counts archived rows
// too -- FUEL-DEDUPE-01/-03 archiving a duplicate does not rekey transaction_reference,
// so an archived row is still un-canonicalized debt, not resolved debt.
//
// Simple scalar ceiling ratchet (same shape as verify-alwaystrack-parity.mjs's per-document
// ratchet, collapsed to one number since this is one cohort, not 34 documents):
//   live > baseline.count               -> FAIL (real growth -- a new unmatched Relay row
//                                            landed without going through vendor-matching)
//   live == baseline.count              -> PASS, printed as known, unresolved debt
//   0 < live < baseline.count           -> PASS, printed as improvement (no reconciliation
//                                            required to accept a shrink -- unlike the total-
//                                            row-count ratchet, the fix path here is routine
//                                            and expected: vendor-match the row)
//   live == 0 but baseline file exists  -> FAIL "remove me from the baseline" (target hit --
//                                            forces a human to confirm and retire the ratchet,
//                                            not silently keep pointing at zero debt)
//
// FAILS CLOSED (never silently skips) when DATABASE_URL is not set — ROUND 29.9-B owner ruling:
// "a live money guard that cannot connect is a FAIL, never a pass." Uses the shared
// requireLiveDbOrExit() helper, not a hand-rolled skip branch (see scripts/lib/require-live-db.mjs
// for why, and scripts/verify-no-silent-db-skip.mjs which enforces this).
import fs from "node:fs";
import path from "node:path";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-fuel-relay-txn-vendor-unmatched";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BASELINE_PATH = path.join(process.cwd(), "scripts/verify-fuel-relay-txn-vendor-unmatched.baseline.json");

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    // BANK-F30150 pattern: a bare session-level set_config is unreliable through Neon's
    // POOLED endpoint -- wrap the read in one explicit transaction with a transaction-scoped
    // bypass so a pooler can't split it across backends.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const res = await client.query(
      `SELECT id::text AS id, transaction_reference, vendor_id, archived_at
         FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid
          AND transaction_reference LIKE 'txn_%'`,
      [USMCA_COMPANY_ID]
    );
    await client.query("COMMIT");

    const liveCount = res.rows.length;
    const baseline = loadBaseline();

    if (!baseline) {
      console.error(
        `${LABEL}: LIVE FAIL — no baseline file (${path.basename(BASELINE_PATH)}). ${liveCount} row(s) live. ` +
          `A reconciled baseline must exist before this guard can pass on a nonzero count.`
      );
      process.exit(1);
    }

    if (liveCount === 0) {
      console.error(
        `${LABEL}: LIVE FAIL — 0 live rows match 'txn_%%' (target reached), but a baseline entry for ` +
          `${baseline.count} still exists — remove ${path.basename(BASELINE_PATH)} (this is good news; ` +
          `confirm it, don't silently keep a stale ceiling on the books).`
      );
      process.exit(1);
    }

    if (liveCount > baseline.count) {
      console.error(
        `${LABEL}: LIVE FAIL — ${liveCount} row(s) carry an un-canonicalized Relay 'txn_%%' reference, ` +
          `up from the baseline ceiling of ${baseline.count} (established ${baseline.established}). ` +
          `A new Relay-bridged fuel row landed without going through vendor-matching — that is a real ` +
          `regression, not debt shrinking. See ${path.basename(BASELINE_PATH)}'s '_what_this_measures' field.`
      );
      const sample = res.rows.slice(0, 10);
      for (const r of sample) {
        console.error(`  ✗ ${r.id} ref=${r.transaction_reference} vendor_id=${r.vendor_id ?? "NULL"} archived=${r.archived_at ? "yes" : "no"}`);
      }
      process.exit(1);
    }

    if (liveCount === baseline.count) {
      console.log(
        `${LABEL}: LIVE PASS — ${liveCount} row(s) known, unresolved Relay-bridge vendor-unmatched debt ` +
          `(baseline ceiling ${baseline.count}, established ${baseline.established}; target is 0 — see ` +
          `verify-bnk01-fuzzy-vendor-match.mjs for the existing vendor-matching engine this should reuse).`
      );
      return;
    }

    // liveCount < baseline.count: real improvement, no reconciliation gate required — the fix
    // path (vendor-match the row) is routine and expected, unlike the total-row-count ratchet's
    // ingest-driven growth/shrink which needs a human explanation every time it moves.
    console.log(
      `${LABEL}: LIVE PASS — ${liveCount} row(s) remain (down from the ${baseline.count}-row baseline ` +
        `ceiling established ${baseline.established}) — progress toward 0. Ceiling not yet lowered; the ` +
        `next hand-edit to ${path.basename(BASELINE_PATH)} should cite this drop so the ceiling ratchets down too.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

await live();
