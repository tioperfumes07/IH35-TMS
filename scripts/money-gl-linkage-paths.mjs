#!/usr/bin/env node
/**
 * ACCT-F294 — THE COMPLETE SET OF WAYS A JOURNAL ENTRY LINKS BACK TO ITS SOURCE.
 *
 * WHY THIS EXISTS: in ONE session auditing the USMCA money chain I raised THREE separate false
 * alarms — "$16,220 of A/R off the books", "the gl_post_failed rows cannot be joined to an invoice",
 * and "$2,207.57 of voided A/R never reversed". Every one was a WRONG-JOIN error. The data was
 * correct every time; my query was incomplete every time. Each cost real review time, and the third
 * one, acted on, would have DOUBLE-CREDITED A/R by $2,207.57.
 *
 * The root cause is not carelessness. It is that GL postings link back to their source through FOUR
 * DIFFERENT MECHANISMS, and querying any one of them alone yields a confident, plausible, wrong zero.
 * Nothing in the codebase listed them together. This file is that list.
 *
 * Run it to print the paths, or `--sql <schema.table> <uuid>` to get a COMPLETE audit query.
 *
 *   node scripts/money-gl-linkage-paths.mjs
 *   node scripts/money-gl-linkage-paths.mjs --sql accounting.invoices <invoice-uuid>
 */

const PATHS = [
  {
    n: 1,
    name: "DIRECT POSTING LINKAGE",
    how: "accounting.journal_entry_postings.source_transaction_id + source_transaction_type",
    covers: "invoice, bill, bill_payment, customer_payment, expense, fuel_event, bank_categorization, transfer, driver_advance, prepaid_purchase, fixed_asset_depreciation",
    trap: "This is the ONLY path most people query. It is the DEFAULT assumption and it is INCOMPLETE.",
  },
  {
    n: 2,
    name: "REVENUE-RECOGNITION LATCH",
    how: "accounting.load_revenue_recognition_postings.journal_entry_id -> accounting.journal_entries.id",
    covers: "the two-event delivery latch: earn (DR 1150 Unbilled / CR 4000 Income) and bill (DR 1100 A/R / CR 1150)",
    trap:
      "Latch JEs carry NO source_transaction_id. A load-sourced invoice whose A/R was posted by the " +
      "latch looks COMPLETELY UNPOSTED under path 1. This produced the false '$16,220 off the books'.",
  },
  {
    n: 3,
    name: "VOID REVERSAL (MEMO-LINKED — see ACCT-F268)",
    how: "accounting.journal_entries.memo ILIKE '%void reversal of <entity> <uuid>%'",
    covers: "every void reversal produced by postVoidReversal()",
    trap:
      "postVoidReversal inserts a STANDALONE balanced JE with source='auto' and NO source linkage, and " +
      "reversed_by_line_id is NULL BY DESIGN. The reversal is therefore INVISIBLE to any structured " +
      "join. This produced the false '$2,207.57 never reversed'. ACCT-F268 is the fix: make it structural.",
  },
  {
    n: 4,
    name: "STRUCTURAL REVERSAL LINK",
    how: "accounting.journal_entry_postings.reversal_of_line_id / .reversed_by_line_id",
    covers: "reversals that DO carry the structural link",
    trap:
      "Populated on only some reversal paths. A NULL here does NOT mean 'not reversed' — check path 3 " +
      "before concluding anything.",
  },
];

const RULE = [
  "THE RULE THIS FILE ENCODES:",
  "  A ZERO FROM ONE LINKAGE PATH IS NOT A VERDICT. Check all four before reporting missing money.",
  "  If you are about to report that a transaction did not post, you must be able to say which of the",
  "  four paths you checked. 'I queried source_transaction_id and got 0' is not evidence.",
];

function auditSql(table, uuid) {
  return `
-- ACCT-F294 COMPLETE GL LINKAGE AUDIT for ${table} = ${uuid}
-- Run with: SELECT set_config('app.bypass_rls','lucia',true) in the SAME transaction.
WITH direct AS (
  SELECT 'path1_direct'::text AS path, jep.journal_entry_uuid::text AS je_id,
         jep.debit_or_credit, jep.amount_cents, jep.account_id::text
    FROM accounting.journal_entry_postings jep
   WHERE jep.source_transaction_id::text = '${uuid}'
),
latch AS (
  SELECT 'path2_revrec_latch'::text, jep.journal_entry_uuid::text,
         jep.debit_or_credit, jep.amount_cents, jep.account_id::text
    FROM accounting.load_revenue_recognition_postings lrp
    JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = lrp.journal_entry_id
   WHERE lrp.is_active = true
     AND lrp.load_id::text = COALESCE(
           (SELECT i.source_load_id::text FROM accounting.invoices i WHERE i.id::text = '${uuid}'),
           '${uuid}')
),
void_rev AS (
  SELECT 'path3_void_reversal_memo'::text, jep.journal_entry_uuid::text,
         jep.debit_or_credit, jep.amount_cents, jep.account_id::text
    FROM accounting.journal_entries je
    JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
   WHERE je.memo ILIKE '%void reversal%' AND je.memo ILIKE '%' || '${uuid}' || '%'
),
structural AS (
  SELECT 'path4_structural_reversal'::text, jep.journal_entry_uuid::text,
         jep.debit_or_credit, jep.amount_cents, jep.account_id::text
    FROM accounting.journal_entry_postings jep
   WHERE jep.reversal_of_line_id IN (
           SELECT id FROM accounting.journal_entry_postings WHERE source_transaction_id::text = '${uuid}')
)
SELECT * FROM direct
UNION ALL SELECT * FROM latch
UNION ALL SELECT * FROM void_rev
UNION ALL SELECT * FROM structural;
`.trim();
}

const args = process.argv.slice(2);
if (args[0] === "--sql" && args[1] && args[2]) {
  console.log(auditSql(args[1], args[2]));
  process.exit(0);
}

console.log("ACCT-F294 — GL LINKAGE PATHS (there are FOUR, not one)\n");
for (const p of PATHS) {
  console.log(`[PATH ${p.n}] ${p.name}`);
  console.log(`  HOW    : ${p.how}`);
  console.log(`  COVERS : ${p.covers}`);
  console.log(`  TRAP   : ${p.trap}\n`);
}
console.log(RULE.join("\n"));
console.log("\nComplete audit query:  node scripts/money-gl-linkage-paths.mjs --sql accounting.invoices <uuid>");
