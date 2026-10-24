#!/usr/bin/env node
// ROUND 236 (Lead, P0) — AUTH-089's duplicate-expense-document cleanup voided real charges by
// keying "duplicate" identity on (load_id, total_amount_cents) alone. Any carrier billed the same
// amount twice on one load (scales, tolls, parking, DEF, lumpers — exactly the charges that repeat
// at the same price) gets a REAL charge silently voided, understating cost and inflating margin.
// Measured live: 10 of AUTH-089's voided rows carried a vendor_document_number, and ALL 10 (100%)
// had NO live row on the same load bearing that same document -- not one was a true duplicate of
// the document it claimed to duplicate.
//
// THE CORRECT DUPLICATE IDENTITY (Lead's ruling, verbatim):
//   (operating_company_id, vendor_uuid, vendor_document_number, transaction_date, total_amount_cents)
// Where vendor_document_number IS NULL, rows are NOT comparable and must never be auto-voided --
// they go to a human review queue (the 77-row triage register, ROUND 236 item 4), never an
// automated (load, amount) match.
//
// This guard is the permanent backstop against this exact defect class recurring:
//   A. no void_reason may ever cite "(load, amount)" as its supersession basis -- that phrase
//      itself is now the tell of an unsafe dedupe key, whoever writes the next sweep.
//   B. every LIVE voided row carrying a vendor_document_number must have a live (non-void) row
//      with that SAME document on that SAME load -- proving the "superseded by" claim is real.
//      Shrink-only ratchet: 9 known violations today (10 measured, 1 reinstated via AUTH-127/
//      ROUND 236 this round), never allowed to grow.
//   C. settlement 5787's non-diesel expense total must equal AlwaysTrack's own $140.20 exactly --
//      the concrete, named case this round exists to prove stays fixed. Measured over the document's loads
//      (13549 + 13555) plus its Drv reimbursement lines (443.101; see check C below).
import { register } from "tsx/esm/api";
import { buildPgPoolConfig } from "./lib/pg-connection-options.cjs"; // TLS off for CI's local postgres, on for Neon

export const REQUIRES_LIVE_DB = "duplicate-expense identity is a live-data invariant; cannot connect = FAIL, never a silent pass";

register();

const LABEL = "verify-expense-dedupe-never-keys-on-load-and-amount";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// Shrink-only ratchet. Measured live 2026-09-29 after AUTH-127 reinstated 13549-19 (doc 6232741):
// 9 of AUTH-089's voided, document-numbered rows still have no live row on their own load bearing
// that same document. Never raise this number; lower it only as real reinstatements land.
// 443.101: measured 0 on prod (2026-10-12) — lowered to match, shrink-only.
const KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS = 0;
// Shrink-only ratchet for check A too. Reinstatement CLEARS void_reason entirely (confirmed live on
// 3ce7e2a5 after AUTH-127 -- was AUTH-089 text, is now NULL), so this count and
// KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS shrink via the exact same remediation (triage, then either
// reinstate or a corrected void_reason) -- not a text-editing exercise. Measured live 2026-09-29
// after AUTH-127: 86 rows total carry the "(load, amount)"/AUTH-089 fingerprint (the 77-row
// undocumented triage register plus the 9 still-unresolved documented ones).
// 443.101: measured 0 on prod (2026-10-12) — lowered to match, shrink-only.
const KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS = 0;

function fmt(cents) {
  return (Number(cents) / 100).toFixed(2);
}

/** Pure verdict over the three live measurements — main() and --selftest share it. */
export function judgeDedupe({ loadAmountCount, violRows, settl5787Cents }) {
  const failures = [];
  if (loadAmountCount > KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS) {
    failures.push(
      `${loadAmountCount} row(s) now carry a void_reason citing "(load, amount)" -- GREW past the ratchet baseline of ${KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS}. A new sweep just reintroduced the unsafe key.`
    );
  }
  if (violRows.length > KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS) {
    failures.push(
      `${violRows.length} voided, document-numbered row(s) have no live row on their own load bearing the same document -- ` +
        `GREW past the ratchet baseline of ${KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS}. New rows: ` +
        violRows.map((r) => `${r.load_number}/${r.vendor_document_number}/$${fmt(r.total_amount_cents)}`).join(", ")
    );
  }
  if (settl5787Cents !== 14020) {
    failures.push(`settlement 5787 (loads 13549 + 13555, plus its Drv reimbursement lines) non-diesel expense total is $${fmt(settl5787Cents)}, expected $140.20 exactly (AlwaysTrack ground truth)`);
  }
  return failures;
}

async function selftest() {
  const failures = [];
  if (typeof KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS !== "number" || KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS < 0) {
    failures.push("ratchet baseline must be a non-negative number");
  }
  if (KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS >= 10) {
    failures.push("ratchet baseline did not shrink below the originally-measured 10 -- AUTH-127's reinstatement must be reflected");
  }
  if (typeof KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS !== "number" || KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS < 0) {
    failures.push("(load, amount) ratchet baseline must be a non-negative number");
  }
  // Planted violations through the same verdict main() uses.
  const row = (n) => ({ load_number: "13549", vendor_document_number: `D${n}`, total_amount_cents: 1000 });
  const clean = { loadAmountCount: KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS, violRows: Array.from({ length: KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS }, (_, i) => row(i)), settl5787Cents: 14020 };
  if (judgeDedupe(clean).length) failures.push("clean measurements (at the baselines, $140.20) rejected");
  const plants = [
    ["a new sweep voids on (load, amount)", { ...clean, loadAmountCount: KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS + 1 }],
    ["a new document-numbered void with no live twin", { ...clean, violRows: [...clean.violRows, row(99)] }],
    ["settlement 5787 loses a real $1 charge", { ...clean, settl5787Cents: 13920 }],
    ["settlement 5787 gains a voided charge back", { ...clean, settl5787Cents: 14120 }],
  ];
  let caught = 0;
  for (const [name, input] of plants) {
    if (judgeDedupe(input).length) caught += 1;
    else failures.push(`planted violation escaped: ${name}`);
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted violations caught`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    await selftest();
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).`);
    process.exitCode = 1;
    return;
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool(buildPgPoolConfig(process.env.DATABASE_URL));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const failures = [];

    // A. no void_reason may ever cite "(load, amount)" as its supersession basis -- the phrase
    // itself is the defect's fingerprint (checked across the whole table, not just AUTH-089, so no
    // future sweep can reintroduce this key under a different AUTH id). Shrink-only ratchet: this
    // count falls via the SAME remediation as check B (reinstatement clears void_reason entirely --
    // confirmed live), never via editing historical text.
    const loadAmountRes = await client.query(
      `SELECT count(*)::int AS n FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND void_reason ILIKE '%(load, amount)%'`,
      [USMCA]
    );
    const loadAmountCount = loadAmountRes.rows[0].n;
    if (loadAmountCount < KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS) {
      console.log(`${LABEL}: NOTE — ratchet improved (${loadAmountCount} < baseline ${KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS}). Lower KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS in this file to match.`);
    }

    // B. Scoped to the actual defect class: a voided row whose OWN void_reason claims it was
    // superseded by a duplicate live row (AUTH-089's phrasing, or any future sweep using the same
    // claim under a different id). Every voided row with a document number is NOT in scope here --
    // most are void for unrelated, legitimate reasons (R-164 attribution reissues, R-185 credit-
    // account corrections, ACCT-F20260925 ground-truth resets, etc.) that never claimed a live
    // duplicate exists and so have nothing to verify against. Only a row that MAKES that specific
    // claim must be held to it.
    const violRes = await client.query(
      `SELECT e.id::text, l.load_number, e.vendor_document_number, e.total_amount_cents
         FROM accounting.expenses e
         JOIN mdata.loads l ON l.id = e.load_id
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NOT NULL
          AND e.vendor_document_number IS NOT NULL
          AND (e.void_reason ILIKE '%superseded by%' OR e.void_reason ILIKE 'AUTH-089%')
          AND NOT EXISTS (
            SELECT 1 FROM accounting.expenses e2
             WHERE e2.load_id = e.load_id
               AND e2.vendor_document_number = e.vendor_document_number
               AND e2.voided_at IS NULL
               AND e2.id <> e.id
          )`,
      [USMCA]
    );
    const violCount = violRes.rows.length;
    if (violCount < KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS) {
      console.log(`${LABEL}: NOTE — ratchet improved (${violCount} < baseline ${KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS}). Lower KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS in this file to match.`);
    }

    // C. settlement 5787's non-diesel expense total must equal AlwaysTrack's own $140.20 exactly.
    // 443.101 — measured over the SIGNED DOCUMENT, not load 13549 alone: #25389 (6ece36c912, owner standing order
    // 2026-10-04) sends each EXPENSES row to the load the document proves (5787 = loads 13549 + 13555), and a Drv
    // (is_reimbursable) row posts as a 'reimbursement' settlement line — Dr expense / Cr 2175 through the close engine —
    // not as an accounting.expenses row (settlement-creator.service.ts, "Drv reimbursements"). The total is still the
    // document's $140.20 exactly: a lost row, a duplicate, or a voided charge brought back all move it.
    // 443.199: a Dreamline statement card-difference row (443.142 import, vendor_document_number
    // 'dreamline_efs=<efs>:<product>:<n>-CARD-DIFF', memo 'Dreamline statement … card charged N cents more than receipt')
    // is the company's card cost from the bank-side statement — it is not on the driver's signed document, so it is
    // excluded from the document total by its own marker (live 10-17: 13555-7 / 13555-8, 2¢ each) and never by amount.
    // 443.329: Dreamline statement card-DISCOUNT rows (vendor_document_number 'dreamline_efs=<efs>:<product>:<n>-CARD-DISC',
    // created by statement-card-credit-repair.service.ts) are also bank-side — they represent a fuel card discount on the
    // company's Dreamline payable, not a driver-signed expense. Excluded from the document total by the same marker
    // (live 10-24: 13549-4 $94.79, 13549-5 $0.02).
    const settl5787Res = await client.query(
      `WITH s AS (
         SELECT ds.id FROM driver_finance.driver_settlements ds
          WHERE ds.operating_company_id = $1::uuid AND ds.source_document_ref = '5787' AND ds.status <> 'cancelled'
       ), loads AS (
         SELECT DISTINCT sl.load_id FROM driver_finance.settlement_lines sl JOIN s ON s.id = sl.settlement_id
          WHERE sl.load_id IS NOT NULL
       )
       SELECT (
         COALESCE((SELECT sum(e.total_amount_cents)
                     FROM accounting.expenses e
                    WHERE e.operating_company_id = $1::uuid AND e.load_id IN (SELECT load_id FROM loads)
                      AND e.voided_at IS NULL
                      AND NOT ((e.vendor_document_number LIKE 'dreamline\\_efs=%-CARD-DIFF' OR e.vendor_document_number LIKE 'dreamline\\_efs=%-CARD-DISC') AND e.memo LIKE 'Dreamline statement %')
                      AND (e.source_fuel_transaction_id IS NULL
                           OR EXISTS (SELECT 1 FROM fuel.fuel_transactions ft
                                       WHERE ft.id = e.source_fuel_transaction_id AND ft.fuel_type <> 'diesel'))), 0)
         + COALESCE((SELECT sum(round(sl.amount * 100))
                       FROM driver_finance.settlement_lines sl JOIN s ON s.id = sl.settlement_id
                      WHERE sl.line_type = 'reimbursement'), 0)
       )::text AS cents,
       (SELECT count(*) FROM s) AS settlements`,
      [USMCA]
    );
    if (Number(settl5787Res.rows[0]?.settlements ?? 0) !== 1) {
      failures.push(`settlement document 5787: expected exactly 1 live USMCA settlement, found ${settl5787Res.rows[0]?.settlements ?? 0}`);
    }
    const settl5787Cents = Number(settl5787Res.rows[0]?.cents ?? 0);
    failures.push(...judgeDedupe({ loadAmountCount, violRows: violRes.rows, settl5787Cents }));

    await client.query("ROLLBACK");

    if (failures.length) {
      console.error(`${LABEL}: FAIL —`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `${LABEL}: PASS — ${loadAmountCount} rows still cite "(load, amount)" as a void basis (ratchet baseline ${KNOWN_LOAD_AMOUNT_PHRASE_VIOLATIONS}, never grows); ${violCount} unresolved document-numbered voids (ratchet baseline ${KNOWN_UNRESOLVED_DOCUMENT_VIOLATIONS}, never grows); settlement 5787 non-diesel expenses = $140.20 exactly.`
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
