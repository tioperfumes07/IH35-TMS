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
 * ★ FOUR REVERSAL LINKAGE PATHS, AND ALL FOUR ARE LIVE ON PROD. This guard's first version checked
 * only transaction_source_links and immediately reported 22 voided expenses as unreversed — a FALSE
 * POSITIVE on correct data, because expenses are reversed through the POSTING-ENGINE path
 * (reversePostedSourceTransaction → journal_entries.reverses_je_id + expenses.reversed_by_je_id),
 * while bills/invoices/payments go through void.service → postVoidReversal → transaction_source_links.
 * Their expense GL net was 0 the whole time — economically reversed, linked differently. This is
 * exactly the ACCT-F294 rule: a zero from ONE linkage path is not a verdict.
 * A guard that fails CI on correct data gets weakened or deleted, so it must accept ANY valid path.
 *
 * ★★ ACCT-F333 — THE COVERAGE HOLE THIS GUARD SHIPPED WITH, AND WHAT IT COST. bill_payment was
 * missing from this list entirely, so the guard reported green over a voided bill payment whose
 * DR A/P $33.40 was still standing — it WAS the whole of USMCA's phantom A/P residual (+3,340).
 * A guard is only as good as its coverage list.
 *
 * ★★★ AND THE HOLE NEARLY GOT WORSE. The fix as originally specified was "reverse the two payments
 * that show 0 reversing JEs on the reverses_je_id chain". Live prod said otherwise: 960f4ac5 was
 * ALREADY reversed through the LINE-level pointers (reversal_of_line_id / reversed_by_line_id) with
 * reverses_je_id NULL, because its reversal (2026-08-08) predates the LV-INVOICE-VOID-REVERSAL fix
 * that started populating the JE-level FK. Reversing it again would have DOUBLE-REVERSED a correct
 * document and swung A/P the wrong way. Hence PATH 4 below: the line-level link is the oldest and
 * most reliable of the four, and omitting it makes this guard fail CI on correctly-reversed data.
 *
 * ROLE NAMES: the two reversal writers disagree and both are live — void.service/postVoidReversal
 * writes relationship_role 'reversal_of' (bill 38, invoice 16, customer_payment 4, prepaid_purchase),
 * the posting engine writes 'reversal' (expense 42, bill_payment 8). Accept BOTH or PATH 1 silently
 * matches nothing for half the doc types. Note the link's linked_object_type is the
 * source_transaction_type ('prepaid_purchase'), NOT the table's object name ('prepaid_asset').
 */
const REVERSAL_ROLES = ["reversal_of", "reversal"];

const DOC_TYPES = [
  { table: "accounting.bills", type: "bill", voided: "voided_at IS NOT NULL OR revoked_at IS NOT NULL" },
  { table: "accounting.invoices", type: "invoice", voided: "voided_at IS NOT NULL OR status = 'void'" },
  // reversed_by_je_id is the posting-engine reversal pointer on this table.
  { table: "accounting.expenses", type: "expense", voided: "voided_at IS NOT NULL", jeLinkColumn: "reversed_by_je_id" },
  { table: "accounting.payments", type: "customer_payment", voided: "voided_at IS NOT NULL" },
  // ACCT-F333 — the doc type whose absence hid a live unreversed void. Bill payments carry BOTH
  // revoked_at and status='void'; the void path sets both, a migration might set only one.
  { table: "accounting.bill_payments", type: "bill_payment", voided: "revoked_at IS NOT NULL OR status = 'void'" },
  // Voided prepaid assets reverse through PATH 1 with linked_object_type = 'prepaid_purchase'.
  { table: "accounting.prepaid_assets", type: "prepaid_purchase", voided: "voided_at IS NOT NULL OR status = 'voided'" },
  { table: "banking.transfers", type: "transfer", voided: "revoked_at IS NOT NULL" },
  { table: "accounting.fixed_assets", type: "fixed_asset_depreciation", voided: "voided_at IS NOT NULL OR status = 'void'" },
];

/**
 * DELIBERATELY EXCLUDED, each for a stated reason — an unexplained omission is how ACCT-F333 happened.
 *
 * - driver_advance (driver_finance.driver_advances): the table has NO void predicate at all — only
 *   `status`, whose sole value on prod is 'outstanding'. There is nothing to check yet; adding it
 *   would contribute a permanent 0 that LOOKS like coverage. Revisit when a void path exists.
 * - fuel_event / bank_categorization: high-volume automatic feeds, not voidable money documents.
 * - loan_payment: single doc, amortization-row sourced; its void semantics are not yet settled.
 *
 * Every type in DOC_TYPES had its id-space verified against prod before being added: each distinct
 * source_transaction_id for that type resolves to a row in the named table (prepaid_purchase 2/2,
 * transfer 4/4, fixed_asset_depreciation 1/1, bill_payment 6/6). A doc type whose ids do NOT match
 * its table joins to nothing and reports a clean 0 forever — coverage theatre, not coverage.
 */

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

  // A REACHABLE DATABASE IS NOT A MIGRATED ONE. CI's build-typecheck job hands this guard a live
  // DATABASE_URL pointing at a fresh Postgres that has never had the accounting schema applied, so the
  // first query died with `relation "accounting.bills" does not exist` and the guard reported FAIL —
  // a crash dressed up as a money finding. The existing SKIP only covered "no URL" and "cannot
  // connect"; this is the third static context and it needs the same treatment. Keyed on the oldest,
  // most fundamental money table: if accounting.bills is absent, no migrations ran here at all.
  const schemaProbe = await client.query(`SELECT to_regclass('accounting.bills') IS NOT NULL AS present`);
  if (!schemaProbe.rows[0]?.present) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`[${LABEL}] SKIP — database reachable but the accounting schema is not present (fresh/unmigrated DB); this guard is DB-backed by design`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  for (const doc of DOC_TYPES) {
    // A doc type whose table is missing must be NAMED, never silently skipped — an unchecked type that
    // reports nothing is exactly the coverage hole that let ACCT-F333 through.
    const tbl = await client.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [doc.table]);
    if (!tbl.rows[0]?.present) {
      summary.push(`${doc.type}: TABLE ABSENT — not checked`);
      continue;
    }
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
              -- PATH 1: void.service → postVoidReversal → transaction_source_links.
              -- Both role spellings are live (see REVERSAL_ROLES) — checking one misses half.
              AND NOT EXISTS (
                SELECT 1 FROM accounting.transaction_source_links tsl
                 WHERE tsl.linked_object_type = $1
                   AND tsl.linked_object_id = d.id::text
                   AND tsl.relationship_role = ANY($2::text[])
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
              -- PATH 4: LINE-level reversal pointer — the oldest and most reliable link, and the only
              -- one present on reversals written before the JE-level FK existed (ACCT-F333: bill
              -- payment 960f4ac5 is reversed by THIS path alone; without it this guard fails CI on a
              -- correctly reversed document and invites someone to weaken it).
              AND NOT EXISTS (
                SELECT 1 FROM accounting.journal_entry_postings orig
                 WHERE orig.source_transaction_type = $1
                   AND orig.source_transaction_id = d.id::text
                   AND orig.reversed_by_line_id IS NOT NULL
              )
          ) AS voided_posted_without_reversal
        FROM ${doc.table} d
      `,
      [doc.type, REVERSAL_ROLES]
    );
    const voidedDocs = Number(rows[0]?.voided_docs ?? 0);
    const missing = Number(rows[0]?.voided_posted_without_reversal ?? 0);
    totalVoided += voidedDocs;
    summary.push(`${doc.type}: ${voidedDocs} voided / ${missing} missing reversal`);
    if (missing > 0) {
      problems.push(
        `${doc.table}: ${missing} VOIDED document(s) have GL postings but NO reversal on ANY of the 4 linkage paths (source link / document JE pointer / reverses_je_id chain / line-level pointer) — their balance is still standing on the control account. A void is a reversal, not a status flip (ACCT-F330: 3 bills voided by a migration left $1,643.21 of phantom A/P; ACCT-F333: 1 bill payment left $33.40).`
      );
    }
  }
  /**
   * journal_entry gets its OWN probe, because its postings are not keyed the way every other doc's
   * are: a JE owns its lines through journal_entry_uuid, not source_transaction_id. Bolting it into
   * DOC_TYPES with the shared query would join on nothing and report a permanent, reassuring 0.
   *
   * Prod today: ZERO journal entries are voided in place — by design, because reversal-by-new-JE is
   * the only mechanism WORM permits. So this check is forward-looking on purpose: the day a code path
   * or migration starts flipping journal_entries.voided_at instead of writing a reversing entry, this
   * is what catches it. It is counted separately from totalVoided so it can never be the thing that
   * satisfies the completeness discriminator.
   */
  const jeRes = await client.query(
    `
      SELECT count(*) FILTER (WHERE je.voided_at IS NOT NULL OR je.status = 'voided') AS voided_jes,
             count(*) FILTER (
               WHERE (je.voided_at IS NOT NULL OR je.status = 'voided')
                 AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = je.id)
                 AND je.reversed_by_je_id IS NULL
                 AND NOT EXISTS (SELECT 1 FROM accounting.journal_entries rev WHERE rev.reverses_je_id = je.id)
                 AND NOT EXISTS (
                   SELECT 1 FROM accounting.transaction_source_links tsl
                    WHERE tsl.linked_object_type = 'journal_entry'
                      AND tsl.linked_object_id = je.id::text
                      AND tsl.relationship_role = ANY($1::text[])
                 )
             ) AS voided_posted_without_reversal
        FROM accounting.journal_entries je
    `,
    [REVERSAL_ROLES]
  );
  const voidedJes = Number(jeRes.rows[0]?.voided_jes ?? 0);
  const jesMissing = Number(jeRes.rows[0]?.voided_posted_without_reversal ?? 0);
  summary.push(`journal_entry: ${voidedJes} voided / ${jesMissing} missing reversal`);
  if (jesMissing > 0) {
    problems.push(
      `accounting.journal_entries: ${jesMissing} VOIDED journal entr(ies) have postings but no reversing entry — a JE must never be voided in place; WORM permits only reversal by a new entry.`
    );
  }

  await client.query("COMMIT");

  // Completeness discriminator — a clean result on zero voided documents proves nothing.
  if (totalVoided === 0) {
    fail(
      `no voided money documents found in ANY of the ${DOC_TYPES.length} tables — that is an unverifiable read (RLS mask or empty DB), not a clean result`
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
