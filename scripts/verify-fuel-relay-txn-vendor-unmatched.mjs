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
// ACCT-F11105 (2026-11-04) — what counts. Old rule -> new rule -> why:
//   OLD: every USMCA row whose transaction_reference LIKE 'txn_%' counted, whatever it was tied to.
//   NEW: a 'txn_%' row counts unless it is CANONICAL: a vendor is set, it is tied to a LIVE Relay fill
//        (integrations.relay_fuel_transactions, voided_at IS NULL AND is_active) and its reference IS that fill's own
//        transaction_id. Everything this guard was written for still counts — vendor NULL (the 75), a raw token on a row
//        no live fill carries (the bridge rows), a token that names a different fill, a token whose fill was voided.
//   WHY: ENG-65 (#28457, LEAD 11-03) records a Relay fill no settlement printed at receipt, through the one Relay writer,
//        with the Relay vendor and the Relay transaction id as its reference — Relay prints no other ticket number; the
//        Settlement Creator re-stamps the printed number when a settlement adopts the fill. The first ENG-65 sweep
//        (2026-11-04 12:00Z) wrote 59 such rows ($15,371.65, 45 fills): each is vendor-matched and tied to its own live
//        fill, i.e. not the un-canonicalized debt this guard measures. No baseline blesses them; the target stays 0.
// FAILS CLOSED (never silently skips) when DATABASE_URL is not set — ROUND 29.9-B owner ruling:
// "a live money guard that cannot connect is a FAIL, never a pass." Uses the shared
// requireLiveDbOrExit() helper, not a hand-rolled skip branch (see scripts/lib/require-live-db.mjs
// for why, and scripts/verify-no-silent-db-skip.mjs which enforces this).
import fs from "node:fs";
import path from "node:path";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

// REQUIRES_LIVE_DB (ruled 2026-09-23, docs/bus/INBOX-CC-1.md): excludes this guard from
// scripts/verify-static.mjs's dead-port sentinel sweep entirely -- a fail-closed live-money guard
// asked a question it cannot answer there is a false positive in that sweep, not a defect here.
// money-pr-local-gate.mjs still runs this for real against a live DATABASE_URL (still fails
// closed where it actually matters), and verify-no-silent-db-skip.mjs still catches a silent-exit-0
// regression. This is a declaration, not an escape hatch.
export const REQUIRES_LIVE_DB = "scalar ceiling ratchet against fuel.fuel_transactions, fails closed via requireLiveDbOrExit, cannot be meaningfully exercised without a live Neon connection";

const LABEL = "verify-fuel-relay-txn-vendor-unmatched";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BASELINE_PATH = path.join(process.cwd(), "scripts/verify-fuel-relay-txn-vendor-unmatched.baseline.json");

/**
 * ACCT-F11105 — a 'txn_%' row is canonical (not debt) only when vendor-matched AND tied to a live Relay fill whose own
 * transaction_id is the row's reference. Pure; the live query reads the same four facts.
 * @param {{transaction_reference:string, vendor_id:string|null, fill_transaction_id:string|null, fill_live:boolean|null}} r
 */
export function isCanonicalRelayReference(r) {
  return Boolean(r.vendor_id) && Boolean(r.fill_live) && r.fill_transaction_id != null &&
    String(r.transaction_reference) === String(r.fill_transaction_id);
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

/**
 * Pure evaluation of the ratchet — no I/O, fully unit-testable. Mirrors the exact four-arm
 * decision the file header documents. Exported implicitly via the module scope for --selftest.
 * @param {number} liveCount
 * @param {{count:number, established:string}|null} baseline
 * @returns {{ok: boolean, message: string}}
 */
function evaluateRatchet(liveCount, baseline) {
  if (!baseline) {
    if (liveCount === 0) {
      // Target reached and baseline retired — no debt, no ceiling needed.
      return {
        ok: true,
        message: `0 live rows match 'txn_%%' and no baseline file — target reached, ratchet retired.`,
      };
    }
    return {
      ok: false,
      message: `no baseline file (${path.basename(BASELINE_PATH)}). ${liveCount} row(s) live. ` +
        `A reconciled baseline must exist before this guard can pass on a nonzero count.`,
    };
  }
  if (liveCount === 0) {
    return {
      ok: false,
      message: `0 live rows match 'txn_%%' (target reached), but a baseline entry for ` +
        `${baseline.count} still exists — remove ${path.basename(BASELINE_PATH)} (this is good news; ` +
        `confirm it, don't silently keep a stale ceiling on the books).`,
    };
  }
  if (liveCount > baseline.count) {
    return {
      ok: false,
      message: `${liveCount} row(s) carry an un-canonicalized Relay 'txn_%%' reference, ` +
        `up from the baseline ceiling of ${baseline.count} (established ${baseline.established}). ` +
        `A new Relay-bridged fuel row landed without going through vendor-matching — that is a real ` +
        `regression, not debt shrinking. See ${path.basename(BASELINE_PATH)}'s '_what_this_measures' field.`,
    };
  }
  if (liveCount === baseline.count) {
    return {
      ok: true,
      message: `${liveCount} row(s) known, unresolved Relay-bridge vendor-unmatched debt ` +
        `(baseline ceiling ${baseline.count}, established ${baseline.established}; target is 0 — see ` +
        `verify-bnk01-fuzzy-vendor-match.mjs for the existing vendor-matching engine this should reuse).`,
    };
  }
  // liveCount < baseline.count: real improvement, no reconciliation gate required — the fix
  // path (vendor-match the row) is routine and expected, unlike the total-row-count ratchet's
  // ingest-driven growth/shrink which needs a human explanation every time it moves.
  return {
    ok: true,
    message: `${liveCount} row(s) remain (down from the ${baseline.count}-row baseline ` +
      `ceiling established ${baseline.established}) — progress toward 0. Ceiling not yet lowered; the ` +
      `next hand-edit to ${path.basename(BASELINE_PATH)} should cite this drop so the ceiling ratchets down too.`,
  };
}

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    // BANK-F30150 pattern: a bare session-level set_config is unreliable through Neon's
    // POOLED endpoint -- wrap the read in one explicit transaction with a transaction-scoped
    // bypass so a pooler can't split it across backends.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const all = await client.query(
      `SELECT ft.id::text AS id, ft.transaction_reference, ft.vendor_id::text AS vendor_id, ft.archived_at,
              rf.transaction_id AS fill_transaction_id, (rf.voided_at IS NULL AND rf.is_active) AS fill_live
         FROM fuel.fuel_transactions ft
         LEFT JOIN integrations.relay_fuel_transactions rf
           ON rf.id = ft.relay_fuel_transaction_id AND rf.operating_company_id = ft.operating_company_id
        WHERE ft.operating_company_id = $1::uuid
          AND ft.transaction_reference LIKE 'txn_%'`,
      [USMCA_COMPANY_ID]
    );
    await client.query("COMMIT");

    const res = { rows: all.rows.filter((r) => !isCanonicalRelayReference(r)) };
    console.log(`${LABEL}: ${all.rows.length} 'txn_%' row(s); ${all.rows.length - res.rows.length} canonical (vendor set, tied to its own live Relay fill by its transaction id); ${res.rows.length} counted`);
    const liveCount = res.rows.length;
    const baseline = loadBaseline();
    const verdict = evaluateRatchet(liveCount, baseline);

    if (!verdict.ok) {
      console.error(`${LABEL}: LIVE FAIL — ${verdict.message}`);
      if (baseline && liveCount > baseline.count) {
        const sample = res.rows.slice(0, 10);
        for (const r of sample) {
          console.error(`  ✗ ${r.id} ref=${r.transaction_reference} vendor_id=${r.vendor_id ?? "NULL"} archived=${r.archived_at ? "yes" : "no"}`);
        }
      }
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — ${verdict.message}`);
  } finally {
    client.release();
    await pool.end();
  }
}

// SELFTEST — no DB, no network, exercises evaluateRatchet's real decision logic against 5
// synthetic scenarios (the file header's exact four-arm table plus the no-baseline edge). Every
// planted "should be a defect" case is checked for the correct exit signal; reports a
// machine-parseable N/N per verify-guard-selftests-are-real.mjs's convention.
function selftest() {
  const cases = [ // STALE-LITERAL-OK: selftest fixtures with hardcoded baseline counts for ratchet logic testing
    { name: "no baseline", liveCount: 5, baseline: null, wantOk: false },
    { name: "growth", liveCount: 80, baseline: { count: 76, established: "2026-09-23" }, wantOk: false },
    { name: "target-hit-stale-baseline", liveCount: 0, baseline: { count: 76, established: "2026-09-23" }, wantOk: false },
    { name: "known debt (unchanged)", liveCount: 76, baseline: { count: 76, established: "2026-09-23" }, wantOk: true },
    { name: "improvement (shrink)", liveCount: 68, baseline: { count: 76, established: "2026-09-23" }, wantOk: true },
  ];
  let caught = 0;
  for (const c of cases) {
    const verdict = evaluateRatchet(c.liveCount, c.baseline);
    if (verdict.ok === c.wantOk) {
      caught++;
    } else {
      console.error(`${LABEL}: SELFTEST FAIL — case "${c.name}" expected ok=${c.wantOk}, got ok=${verdict.ok} (${verdict.message})`);
    }
  }
  // ACCT-F11105 — the canonical-reference predicate: only a vendor-matched row tied to its OWN live fill is excluded.
  const C = (o) => ({ transaction_reference: "txn_A", vendor_id: "v", fill_transaction_id: "txn_A", fill_live: true, ...o });
  const canon = [
    ["ENG-65 shape (vendor, own live fill) is canonical", C(), true],
    ["vendor NULL counts (the original 75)", C({ vendor_id: null }), false],
    ["no Relay fill tied counts (bridge row)", C({ fill_transaction_id: null, fill_live: null }), false],
    ["a token naming a different fill counts", C({ fill_transaction_id: "txn_B" }), false],
    ["a token whose fill is voided counts", C({ fill_live: false }), false],
  ];
  for (const [name, row, want] of canon) {
    const got = isCanonicalRelayReference(row);
    if (got === want) caught++;
    else console.error(`${LABEL}: SELFTEST FAIL — "${name}" expected ${want}, got ${got}`);
    cases.push({ name });
  }
  if (caught !== cases.length) {
    console.error(`${LABEL}: SELFTEST FAILED ${caught}/${cases.length} planted case(s) matched expected verdict.`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST caught ${caught}/${cases.length} planted case(s) — evaluateRatchet's real decision logic, no DB required.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
