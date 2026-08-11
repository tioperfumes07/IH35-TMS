#!/usr/bin/env node
/**
 * ACCT-F330 — a voided money document left its balance standing on the control account.
 *
 * WHAT HAPPENED: after the owner's complete void-all, USMCA A/P (2000) still read -$1,909.81 with no
 * live document behind it. $1,643.21 of that was 3 bills voided by the ACCT-F142 dedup MIGRATION:
 * a migration flips status/voided_at directly and NEVER calls voidBill, so postVoidReversal never ran.
 * The documents read "void" while their A/P credit stayed in the ledger. Every document-level check
 * passed — document-zero is not economic-zero, and nothing asserted the difference.
 *
 * THE INVARIANT: a voided money document that HAS GL postings MUST carry a reversal
 * (accounting.transaction_source_links, relationship_role='reversal_of'). Voiding is a reversal, not a
 * status flip — QuickBooks zeroes a voided bill's ledger impact and NetSuite writes a reversing
 * journal; leaving the payable standing would overstate A/P to any lender, auditor or CPA reading the
 * balance sheet.
 *
 * Deliberately checks the LINK, not the arithmetic: a balance can be coincidentally zero while a
 * reversal is missing, and per-document arithmetic is not attributable because reversal postings carry
 * source_transaction_type = NULL by design (they are standalone JEs).
 *
 * DB-backed. Per the false-empty law it refuses to pass on a zero it cannot corroborate: every count is
 * paired with a completeness discriminator, and if there are no voided documents at all it says so
 * rather than reporting a clean run.
 */
import pg from "pg";

const LABEL = "3049-verify-voided-money-doc-has-gl-reversal";

/**
 * Each money doc: its table, the source_transaction_type its postings carry, and its void predicate.
 *
 * ★ TWO REVERSAL LINKAGE PATHS, AND BOTH ARE VALID. This guard's first version checked only
 * transaction_source_links and immediately reported 22 voided expenses as unreversed — a FALSE
 * POSITIVE on correct data, because expenses are reversed through the POSTING-ENGINE path
 * (reversePostedSourceTransaction → journal_entries.reverses_je_id + expenses.reversed_by_je_id),
 * while bills/invoices/payments go through void.service → postVoidReversal → transaction_source_links
 * ('reversal_of'). Their expense GL net was 0 the whole time — economically reversed, linked
 * differently. This is exactly the ACCT-F294 rule: a zero from ONE linkage path is not a verdict.
 * A guard that fails CI on correct data gets weakened or deleted, so it must accept EITHER path.
 */
const DOC_TYPES = [
  { table: "accounting.bills", type: "bill", voided: "voided_at IS NOT NULL OR revoked_at IS NOT NULL" },
  { table: "accounting.invoices", type: "invoice", voided: "voided_at IS NOT NULL OR status = 'void'" },
  // reversed_by_je_id is the posting-engine reversal pointer on this table.
  { table: "accounting.expenses", type: "expense", voided: "voided_at IS NOT NULL", jeLinkColumn: "reversed_by_je_id" },
  { table: "accounting.payments", type: "customer_payment", voided: "voided_at IS NOT NULL" },
];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`[${LABEL}] SKIP — no DATABASE_URL (static context); this guard is DB-backed by design`);
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
let client;
try {
  client = await pool.connect();
} catch {
  console.log(`[${LABEL}] SKIP — database unreachable (static context)`);
  process.exit(0);
}

try {
  await client.query("BEGIN");
  // FORCED RLS on accounting.*: without this every count reads 0 and the guard certifies a ledger it
  // never saw. SET LOCAL inside the txn — a bare SET does not reliably persist on a pooled connection.
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const problems = [];
  const summary = [];
  let totalVoided = 0;

  for (const doc of DOC_TYPES) {
    const { rows } = await client.query(
      `
        SELECT
          count(*) FILTER (WHERE ${doc.voided}) AS voided_docs,
          count(*) FILTER (
            WHERE (${doc.voided})
              AND EXISTS (
                SELECT 1 FROM accounting.journal_entry_postings jep
                 WHERE jep.source_transaction_type = $1
                   AND jep.source_transaction_id = d.id::text
              )
              -- PATH 1: void.service → postVoidReversal → transaction_source_links 'reversal_of'
              AND NOT EXISTS (
                SELECT 1 FROM accounting.transaction_source_links tsl
                 WHERE tsl.linked_object_type = $1
                   AND tsl.linked_object_id = d.id::text
                   AND tsl.relationship_role = 'reversal_of'
              )
              -- PATH 2: posting-engine reversal pointer on the document itself
              ${doc.jeLinkColumn ? `AND d.${doc.jeLinkColumn} IS NULL` : ""}
              -- PATH 3: JE-level chain — a reversing entry naming this document's original JE
              AND NOT EXISTS (
                SELECT 1
                  FROM accounting.journal_entry_postings orig
                  JOIN accounting.journal_entries rev ON rev.reverses_je_id = orig.journal_entry_uuid
                 WHERE orig.source_transaction_type = $1
                   AND orig.source_transaction_id = d.id::text
              )
          ) AS voided_posted_without_reversal
        FROM ${doc.table} d
      `,
      [doc.type]
    );
    const voidedDocs = Number(rows[0]?.voided_docs ?? 0);
    const missing = Number(rows[0]?.voided_posted_without_reversal ?? 0);
    totalVoided += voidedDocs;
    summary.push(`${doc.type}: ${voidedDocs} voided / ${missing} missing reversal`);
    if (missing > 0) {
      problems.push(
        `${doc.table}: ${missing} VOIDED document(s) have GL postings but NO 'reversal_of' link — their balance is still standing on the control account. A void is a reversal, not a status flip (ACCT-F330: 3 bills voided by a migration left $1,643.21 of phantom A/P).`
      );
    }
  }
  await client.query("COMMIT");

  // Completeness discriminator — a clean result on zero voided documents proves nothing.
  if (totalVoided === 0) {
    fail(
      "no voided money documents found in ANY of the four tables — that is an unverifiable read (RLS mask or empty DB), not a clean result"
    );
  }

  if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} document type(s) carry unreversed voids`);
  }

  console.log(`[${LABEL}] PASS — every voided money document with GL postings carries a reversal · ${summary.join(" · ")}`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  fail(`query failed: ${err?.message ?? err}`);
} finally {
  client.release();
  await pool.end();
}
