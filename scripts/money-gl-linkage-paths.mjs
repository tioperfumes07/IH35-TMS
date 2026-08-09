#!/usr/bin/env node
/**
 * ACCT-F294 — THE COMPLETE SET OF WAYS A JOURNAL ENTRY LINKS BACK TO ITS SOURCE (SIX, not four).
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
    name: "STRUCTURAL REVERSAL LINK (LINE LEVEL)",
    how: "accounting.journal_entry_postings.reversal_of_line_id / .reversed_by_line_id",
    covers: "reversals written by the posting engine (bidirectional), and void-service reversals from ACCT-F295 onward (reversal_of_line_id only)",
    trap:
      "Populated on only SOME reversal paths and only from certain dates. A NULL here does NOT mean " +
      "'not reversed' — check paths 3, 5 and 6 before concluding anything.",
  },
  {
    n: 5,
    name: "TRANSACTION SOURCE LINKS",
    how: "accounting.transaction_source_links (journal_entry_posting_id, linked_object_type, linked_object_id, relationship_role)",
    covers: "posting-engine writes, including relationship_role='reversal'",
    trap:
      "A SEPARATE LINK TABLE entirely — invisible to anyone querying only journal_entry_postings. " +
      "I missed it in the first version of this very file, which is the point: the linkage surface is " +
      "wider than any one person remembers.",
  },
  {
    n: 6,
    name: "JOURNAL-ENTRY LEVEL REVERSAL LINK",
    how: "accounting.journal_entries.reverses_je_id / .reversed_by_je_id",
    covers: "JE-to-JE reversal pairing (LV-INVOICE-VOID-REVERSAL-HAS-NO-JE-LINKAGE)",
    trap:
      "Paths 4 and 5 are LINE level; this is ENTRY level. A reversal can be linked at one level and " +
      "not the other. Measured on prod 2026-08-08: 26 JEs carried a 'Reversal of …' memo but only 24 " +
      "carried the FK — so even this path has known holes.",
  },
];

const RULE = [
  "THE RULE THIS FILE ENCODES:",
  "  A ZERO FROM ONE LINKAGE PATH IS NOT A VERDICT. Check ALL SIX before reporting missing money.",
  "  If you are about to report that a transaction did not post, you must be able to say which of the",
  "  six paths you checked. 'I queried source_transaction_id and got 0' is not evidence.",
];

function auditSql(table, uuid) {
  return `
-- ACCT-F294 COMPLETE GL LINKAGE AUDIT (all SIX paths) for ${table} = ${uuid}
-- Rows may repeat across paths — that is CORRECT, it shows WHICH linkage each posting is reachable by.
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
),
source_links AS (
  -- PATH 5: a SEPARATE link table. linked_object_id is TEXT, not uuid — compare as text.
  SELECT 'path5_transaction_source_links'::text, jep.journal_entry_uuid::text,
         jep.debit_or_credit, jep.amount_cents, jep.account_id::text
    FROM accounting.transaction_source_links tsl
    JOIN accounting.journal_entry_postings jep ON jep.id = tsl.journal_entry_posting_id
   WHERE tsl.linked_object_id = '${uuid}'
),
je_level AS (
  -- PATH 6: ENTRY-level reversal pairing, in BOTH directions.
  SELECT 'path6_je_level_reversal'::text, jep.journal_entry_uuid::text,
         jep.debit_or_credit, jep.amount_cents, jep.account_id::text
    FROM accounting.journal_entries je
    JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
   WHERE je.reverses_je_id IN (
           SELECT DISTINCT journal_entry_uuid FROM accounting.journal_entry_postings
            WHERE source_transaction_id::text = '${uuid}')
      OR je.reversed_by_je_id IN (
           SELECT DISTINCT journal_entry_uuid FROM accounting.journal_entry_postings
            WHERE source_transaction_id::text = '${uuid}')
)
SELECT * FROM direct
UNION ALL SELECT * FROM latch
UNION ALL SELECT * FROM void_rev
UNION ALL SELECT * FROM structural
UNION ALL SELECT * FROM source_links
UNION ALL SELECT * FROM je_level;
`.trim();
}

const args = process.argv.slice(2);
if (args[0] === "--sql" && args[1] && args[2]) {
  console.log(auditSql(args[1], args[2]));
  process.exit(0);
}

console.log("ACCT-F294 — GL LINKAGE PATHS (there are SIX, not one)\n");
for (const p of PATHS) {
  console.log(`[PATH ${p.n}] ${p.name}`);
  console.log(`  HOW    : ${p.how}`);
  console.log(`  COVERS : ${p.covers}`);
  console.log(`  TRAP   : ${p.trap}\n`);
}
console.log(RULE.join("\n"));
console.log("\nComplete audit query:  node scripts/money-gl-linkage-paths.mjs --sql accounting.invoices <uuid>");
