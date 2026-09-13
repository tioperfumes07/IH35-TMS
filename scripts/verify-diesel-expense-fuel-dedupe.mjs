#!/usr/bin/env node
// ROUND 23.3 (owner/Lead, 2026-09-13) — B1 "FUEL AS A REAL COST", second half.
// "non-matching expense VOIDED (void_reason='ABSORPTION-D5 duplicate or unmatched fuel row')."
//
// Matches every live (voided_at IS NULL) accounting.expenses row with memo
// ILIKE 'Diesel%' against fuel.fuel_transactions by (transaction_date,
// invoice-number-with-any-trailing-"-L<load>"-suffix-stripped, amount),
// degrading to (transaction_date, amount) when vendor_document_number is the
// literal placeholder "no-invoice" and the fuel row's transaction_reference
// is NULL (same rule scripts/ops/2026-09-13-cc2-absorption-b1-diesel-expense-
// dedupe.ts used). Asserts:
//   1. every live Diesel expense has a match (the 2 known unmatched rows —
//      settlement 5782, which has no company-side settlement document at all —
//      were already voided this session; this guard fails loud if a NEW
//      unmatched one ever appears, so a future absorption run can't silently
//      leave orphaned Diesel-memo expenses unaddressed).
//   2. the 2 specific settlement-5782 rows stay voided with the exact
//      disclosed reason (proves the fix wasn't silently reverted).
//
// Skips gracefully (prints, exits 0) when DATABASE_URL is not set.
import pg from "pg";

const LABEL = "verify-diesel-expense-fuel-dedupe";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const VOID_REASON = "ABSORPTION-D5 duplicate or unmatched fuel row";
const KNOWN_VOIDED_5782_IDS = [
  "fc1e34b9-98a2-49cc-bfcb-febf2b67f678",
  "0154cb7e-6b14-4d97-9ebc-8b19268ad124",
];

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`${LABEL}: LIVE skipped (no DATABASE_URL) — not a pass, not a fail; this check needs a real Neon connection`);
    return;
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
    let failures = 0;

    // 1. every LIVE (non-void) Diesel expense must match a fuel_transactions row.
    const unmatched = await client.query(
      `SELECT e.id, e.transaction_date, e.total_amount_cents, e.vendor_document_number, e.source_settlement_ref
         FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid AND e.memo ILIKE 'Diesel%' AND e.voided_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM fuel.fuel_transactions ft
             WHERE ft.operating_company_id = e.operating_company_id
               AND ft.purchased_at = e.transaction_date
               AND ft.total_cost = (e.total_amount_cents::numeric / 100)
               AND (
                 ft.transaction_reference = regexp_replace(e.vendor_document_number, '-L[0-9]+$', '')
                 OR (ft.transaction_reference IS NULL AND e.vendor_document_number = 'no-invoice')
               )
          )`,
      [USMCA_COMPANY_ID]
    );
    if (unmatched.rows.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${unmatched.rows.length} live Diesel expense(s) have no matching fuel.fuel_transactions row (must be VOIDED, void_reason='${VOID_REASON}'):`);
      for (const r of unmatched.rows) {
        console.error(`  ✗ ${r.id} ${r.transaction_date} $${(Number(r.total_amount_cents) / 100).toFixed(2)} settlement=${r.source_settlement_ref}`);
      }
      failures++;
    }

    // 2. the 2 known settlement-5782 rows stay voided with the exact disclosed reason.
    const knownRes = await client.query(
      `SELECT id, status, void_reason FROM accounting.expenses WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid`,
      [KNOWN_VOIDED_5782_IDS, USMCA_COMPANY_ID]
    );
    if (knownRes.rows.length !== KNOWN_VOIDED_5782_IDS.length) {
      console.error(`${LABEL}: LIVE FAIL — expected ${KNOWN_VOIDED_5782_IDS.length} known settlement-5782 rows, found ${knownRes.rows.length}`);
      failures++;
    }
    for (const r of knownRes.rows) {
      if (r.status !== "void" || r.void_reason !== VOID_REASON) {
        console.error(`${LABEL}: LIVE FAIL — ${r.id} is not correctly voided (status=${r.status}, void_reason=${r.void_reason})`);
        failures++;
      }
    }

    if (failures > 0) process.exit(1);
    console.log(`${LABEL}: LIVE PASS — 0 unmatched live Diesel expenses, 2/2 known settlement-5782 rows correctly voided.`);
  } finally {
    await client.end();
  }
}

await live();
