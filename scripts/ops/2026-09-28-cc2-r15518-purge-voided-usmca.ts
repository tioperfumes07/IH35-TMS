#!/usr/bin/env tsx
/**
 * scripts/ops/2026-09-28-cc2-r15518-purge-voided-usmca.ts — ROUND 155.18 JOB 1 draft, v3.
 *
 * NOT RUN. NOT REVIEWED. --apply is gated behind OWNER_AUTH_ID=AUTH-101, and AUTH-101 has not been
 * opened in docs/bus/OWNER-AUTHORIZATIONS.md -- this script refuses --apply until it is, and even
 * then only after a human has read this file and the accompanying migration
 * 202614300000_worm_auth_gated_purge_bypass.sql. The --apply decision belongs to the user alone,
 * made after personal review -- not something any AUTH text alone authorizes.
 *
 * SCOPE: rows where voided_at IS NOT NULL, operating_company_id = USMCA, across:
 *   accounting.expenses, accounting.bills, accounting.factoring_advances,
 *   banking.bank_transactions, accounting.journal_entries
 * accounting.bill_payments DROPPED -- 0 voided rows live, nothing to delete there.
 * DELETE CRITERION IS voided_at ALONE. No entity-origin filter gates what gets deleted -- see
 * reportTransportationOrigin() below, which is reporting only.
 *
 * === v3 CHANGE: CHILD-ROW FK HANDLING (owner proof-of-concept, 2026-09-28) ===
 * The owner ran a real single-row DELETE (wrapped in ROLLBACK) and hit a foreign-key violation from
 * accounting.expense_lines before accounting.expenses would delete. A full pg_constraint sweep this
 * round found this is NOT unique to expenses -- every target table has true "owned" child/detail
 * rows that must delete first, in the same transaction:
 *
 *   accounting.expenses          -> accounting.expense_lines (expense_id)
 *   accounting.bills             -> accounting.bill_lines (bill_id)
 *                                    [accounting.bill_unit_allocation is ON DELETE CASCADE already --
 *                                     no script action needed, Postgres handles it]
 *   accounting.factoring_advances -> accounting.factoring_reserve_movements (factoring_advance_id)
 *                                  -> accounting.factoring_default_interest_accruals (factoring_advance_id)
 *                                  -> accounting.factoring_lifecycle_posting_keys (factoring_advance_id)
 *   banking.bank_transactions    -> banking.bank_transaction_splits (bank_transaction_id)
 *   accounting.journal_entry_postings -> accounting.transaction_source_links (journal_entry_posting_id)
 *                                    [postings' reversal_of_line_id/reversed_by_line_id do NOT stay
 *                                     within one journal_entry_uuid -- see expandJeClosure below,
 *                                     added after the --apply-test-run rollback proof caught this
 *                                     as a real FK violation]
 *
 * === v4 CHANGE: JE HEADER DELETED ONLY WHEN A RUNTIME SWEEP CONFIRMS IT IS A SAFE HUSK ===
 * accounting.journal_entries in USMCA carries a perfect, live-verified invariant (2026-09-28):
 * 3,565 total, ZERO voided, ZERO with no postings behind them (see
 * scripts/verify-no-journal-entry-has-zero-postings.mjs). Leaving a zero-posting JE header behind
 * (this script's v3 design) would be the first thing ever to create that class of row -- avoidable,
 * given the FK-sweep tooling this script already needed to build for the child/detail tables above.
 *
 * accounting.journal_entries has 50+ inbound FK references across a dozen+ schemas -- fixed_assets,
 * insurance, driver_finance, payroll, banking reconciliation, related-party loans,
 * safety.accident_liabilities, and journal_entries referencing ITSELF via reverses_je_id /
 * reversed_by_je_id. This script does NOT hand-maintain that list (it would drift the moment a new
 * migration adds a 51st FK) and does NOT cascade-delete through it. Instead, as the LAST step for
 * each document whose postings were deleted this run, deleteJeHeaderIfSafeHusk() below:
 *   1. Confirms the JE now has zero remaining journal_entry_postings (true by construction --
 *      the full set was just deleted -- but checked explicitly, not assumed).
 *   2. Builds the live list of every FK constraint referencing accounting.journal_entries FROM
 *      pg_constraint AT RUNTIME (same technique as the child-table sweep in the file header above,
 *      never a hand-written list -- this is self-updating if the schema grows a 51st reference),
 *      and for each one runs a real COUNT(*) against the actual referencing column, excluding the
 *      JE's own self-referential rows.
 *   3. Deletes the JE header ONLY if every one of those counts is zero. If anything still
 *      references it, the header is left in place and the script reports exactly what blocked it
 *      (table + constraint name + live count) -- never forced through, never silently skipped.
 * This keeps the original caution (nothing is hand-waved past the 50+ FK web) while not
 * manufacturing the empty-husk class of row the invariant guard above exists to prevent.
 *
 * For every OTHER unlisted FK (the ~15 "reference" FKs on expenses/bills/factoring_advances/
 * bank_transactions from unrelated modules -- insurance.claim, driver_finance.driver_advances,
 * payroll.driver_settlements, mdata.qbo_bills, etc.) this script does NOT delete or touch the
 * referencing row. Most already carry ON DELETE SET NULL or ON DELETE CASCADE and Postgres handles
 * them automatically with no script code needed. Where the default (RESTRICT/NO ACTION) applies and
 * some live row still references the document being purged, the DELETE fails with a clear FK
 * violation, the whole transaction rolls back, and the script reports which table blocked it --
 * that is the SAFE, correct outcome (it means the "voided" document is still in active use by
 * something this purge was never told about), not a bug to route around.
 *
 * trg_check_journal_entry_balanced (DEFERRABLE INITIALLY DEFERRED, fires at COMMIT) is satisfied
 * trivially when a journal_entry_uuid's full posting set reaches zero rows (confirmed live by
 * reading accounting.ensure_journal_entry_balanced()'s body).
 *
 * Audit: every target table AND every child/detail table listed above already carries its own
 * unconditional AFTER DELETE trigger (confirmed live via pg_trigger for all 7: expense_lines,
 * bill_lines, factoring_reserve_movements, factoring_default_interest_accruals,
 * factoring_lifecycle_posting_keys, bank_transaction_splits, transaction_source_links) that writes
 * the full OLD row into audit.row_changes.old_data. This script adds NO new audit-writing code --
 * every delete this script performs, parent or child, is independently captured before commit by
 * infrastructure that already exists.
 *
 * === v5 CHANGE: SCOPE EXPANDED FROM 5 TABLES TO EVERY TABLE WITH A LIVE VOIDED ROW ===
 * Re-derived live 2026-09-28 from every table with a voided_at column (110 candidates), counted
 * per table scoped to USMCA. 24 tables came back nonzero (see TARGET_TABLES). Several of the newly
 * added tables (driver_finance.driver_settlements: 21 inbound FKs, maintenance.work_orders: 28,
 * accounting.invoices: 14) have FK fan-out as large as journal_entries' 50+ -- hand-classifying
 * every one of those as "owned child" vs "reference" the way the original 5-table CHILD_TABLES map
 * did is not a safe use of judgment at this scale. So getReferencingColumns/deleteIfSafeOrReport
 * (formerly JE-specific) are now GENERIC and apply uniformly to every target table: live
 * pg_constraint sweep, delete only if every referencing count is zero, otherwise report the blocker
 * by name and leave the row untouched -- for all 19 newly-added tables, this generic sweep is the
 * ONLY protection (no hand-curated CHILD_TABLES entries were written for them). This is
 * DELIBERATELY CONSERVATIVE: a table like accounting.invoices has invoice_lines on ON DELETE
 * CASCADE that Postgres would happily auto-clear, but because this script does not explicitly
 * pre-clear it, a voided invoice that still has invoice_lines will show up as BLOCKED in the
 * dry-run report rather than being deleted -- fewer rows purged than technically possible, never
 * more rows touched than intended. Expanding CHILD_TABLES for specific newly-added tables is a
 * legitimate, low-risk follow-up once someone has actually looked at what's blocking them.
 * mdata.customer_quality_events (2 rows) has no operating_company_id column -- it is measured
 * (via a join through mdata.customers) but NOT included in the delete loop in this draft; deleting
 * it needs the same generic-sweep treatment as everything else and was left out for time, not
 * safety -- it is reported, not silently dropped.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r15518-purge-voided-usmca.ts --dry-run
 *   OWNER_AUTH_ID=AUTH-101 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r15518-purge-voided-usmca.ts --apply
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
// BANK-F431 — "DELETE CRITERION IS voided_at ALONE" (this file's own header) is what deleted 274
// Plaid feed-supersession artifacts on 2026-09-28. One canonical predicate now decides, imported and
// never re-typed: apps/backend/src/banking/bank-line-deletable.ts explains why.
import { bankLineDeletablePredicate, recordBankLineDeletionsByIdSql } from "../../apps/backend/src/banking/bank-line-deletable.js";

// Per-table EXTRA clause ANDed onto this engine's "voided_at IS NOT NULL" candidate scan. Empty for
// every table that has no extra law; a table listed here is a table where voided_at alone is wrong.
const EXTRA_DELETE_PREDICATE: Record<string, (alias: string) => string> = {
  "banking.bank_transactions": (alias) => bankLineDeletablePredicate(alias),
};
const extraPred = (table: string, alias: string) =>
  EXTRA_DELETE_PREDICATE[table] ? ` AND ${EXTRA_DELETE_PREDICATE[table](alias)}` : "";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const AUTH_ID = "AUTH-101";
const TRANSP_LOAD_NUMBERS = ["5753", "5760", "5761", "5762", "5763", "5764", "5765", "5766", "5767", "5768"];

// v5: extended from 5 tables to every table with a live voided_at IS NOT NULL row in USMCA right
// now -- re-derived live 2026-09-28 from `SELECT table_schema,table_name FROM information_schema
// .columns WHERE column_name='voided_at'` (110 candidate tables total), then counted per table. 24
// tables came back nonzero. This REPLACES the earlier "5-table" scope -- read the numbers in the
// dry-run output, not this comment, since counts move daily.
const TARGET_TABLES = [
  "accounting.expenses",
  "accounting.bills",
  "accounting.bill_lines",
  "accounting.invoices",
  "accounting.factoring_advances",
  "banking.bank_transactions",
  "accounting.journal_entries",
  "dispatch.non_owned_trailers",
  "dispatch.trailer_interchanges",
  "driver_finance.driver_bills",
  "driver_finance.driver_liabilities",
  "driver_finance.driver_settlement_deductions",
  "driver_finance.driver_settlements",
  "driver_finance.settlement_lines",
  "factoring.customer_factor_assignment",
  "fuel.fuel_transactions",
  "integrations.relay_company_cards",
  "legal.contract_instances",
  "maintenance.work_orders",
  "safety.complaints",
  "safety.dot_inspections",
  "safety.hos_violations",
  "safety.incidents",
  "safety.internal_fines",
  // mdata.customer_quality_events has NO operating_company_id column -- scoped via a join, handled
  // separately in measure()/the delete loop, not via the generic WHERE clause the rest use.
] as const;

// BUG FOUND BY THE --apply-test-run ROLLBACK PROOF: accounting.bills and accounting.factoring_advances
// have NO journal_entry_id column at all (confirmed live, information_schema) -- the earlier
// assumption that all three financial tables link the same way was wrong. Only accounting.expenses
// carries a direct journal_entry_id column. Bills and factoring_advances link to their postings
// polymorphically via journal_entry_postings.source_transaction_type/source_transaction_id (the
// SAME linkage this session's own AUTH-088 work backfilled onto bills earlier) -- see
// SOURCE_TRANSACTION_TYPE below and findJeIdsBySourceTransaction().
const JE_LINK_COLUMN: Record<string, string | null> = {
  "accounting.expenses": "journal_entry_id",
};

const SOURCE_TRANSACTION_TYPE: Record<string, string> = {
  "accounting.bills": "bill",
  "accounting.factoring_advances": "factoring_advance",
};

async function findJeIdsBySourceTransaction(
  client: pg.Client,
  sourceType: string,
  documentIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(); // document id -> je ids
  if (documentIds.length === 0) return out;
  const r = await client.query<{ source_transaction_id: string; journal_entry_uuid: string }>(
    `SELECT DISTINCT source_transaction_id::text, journal_entry_uuid::text
       FROM accounting.journal_entry_postings
      WHERE source_transaction_type = $1 AND source_transaction_id = ANY($2::uuid[])`,
    [sourceType, documentIds],
  );
  for (const row of r.rows) {
    const list = out.get(row.source_transaction_id) ?? [];
    list.push(row.journal_entry_uuid);
    out.set(row.source_transaction_id, list);
  }
  return out;
}

const AMOUNT_COLUMN: Record<string, string | null> = {
  "accounting.expenses": "total_amount_cents",
  "accounting.bills": "amount_cents",
  "accounting.bill_lines": "rate_cents",
  "accounting.invoices": "total_cents",
  "accounting.factoring_advances": "advance_amount_cents",
  "banking.bank_transactions": "amount_cents",
  "driver_finance.driver_bills": "gross_amount_cents",
  "driver_finance.driver_settlement_deductions": "amount_cents",
  "driver_finance.settlement_lines": "rate_cents",
  "maintenance.work_orders": "actual_cost_cents",
  "safety.incidents": "damage_amount_cents",
};

// True "owned" child/detail tables that must delete before their parent document. Each entry:
// [child table, FK column on the child pointing back to the parent's id]. Verified live via
// pg_constraint 2026-09-28 -- see the file header for the full reasoning and what was excluded.
const CHILD_TABLES: Record<string, Array<{ table: string; fk: string }>> = {
  "accounting.expenses": [{ table: "accounting.expense_lines", fk: "expense_id" }],
  "accounting.bills": [{ table: "accounting.bill_lines", fk: "bill_id" }],
  "accounting.factoring_advances": [
    { table: "accounting.factoring_reserve_movements", fk: "factoring_advance_id" },
    { table: "accounting.factoring_default_interest_accruals", fk: "factoring_advance_id" },
    { table: "accounting.factoring_lifecycle_posting_keys", fk: "factoring_advance_id" },
  ],
  "banking.bank_transactions": [{ table: "banking.bank_transaction_splits", fk: "bank_transaction_id" }],
  "accounting.journal_entries": [],
};

async function trialBalance(client: pg.Client): Promise<{ debit: string; credit: string; count: string }> {
  const r = await client.query<{ debit_total: string; credit_total: string; posting_count: string }>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END), 0) AS debit_total,
        COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END), 0) AS credit_total,
        COUNT(*) AS posting_count
      FROM accounting.journal_entry_postings jep
      JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      WHERE je.operating_company_id = $1
    `,
    [USMCA],
  );
  return { debit: r.rows[0].debit_total, credit: r.rows[0].credit_total, count: r.rows[0].posting_count };
}

// mdata.customer_quality_events has no operating_company_id column -- scoped instead via its FK to
// mdata.customers, which does. Handled separately from the generic per-table loop below.
async function measureCustomerQualityEvents(client: pg.Client): Promise<number> {
  const r = await client.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM mdata.customer_quality_events cqe
       JOIN mdata.customers c ON c.id = cqe.customer_id
      WHERE cqe.voided_at IS NOT NULL AND c.operating_company_id = $1`,
    [USMCA],
  );
  return Number(r.rows[0].n);
}

async function measure(client: pg.Client) {
  console.log("=== FRESH COUNTS + DOLLAR TOTALS (re-measured this run, voided_at IS NOT NULL, USMCA) ===");
  const counts: Record<string, number> = {};
  for (const t of TARGET_TABLES) {
    const amtCol = AMOUNT_COLUMN[t];
    const r = await client.query<{ n: string; total: string | null }>(
      `SELECT COUNT(*) AS n, ${amtCol ? `SUM(${amtCol})` : "NULL"} AS total
         FROM ${t} WHERE voided_at IS NOT NULL AND operating_company_id = $1${extraPred(t, t)}`,
      [USMCA],
    );
    counts[t] = Number(r.rows[0].n);
    const dollars = r.rows[0].total ? `$${(Number(r.rows[0].total) / 100).toFixed(2)}` : "n/a";
    console.log(`  ${t}: ${r.rows[0].n} rows, ${dollars}`);
  }
  const cqeCount = await measureCustomerQualityEvents(client);
  counts["mdata.customer_quality_events"] = cqeCount;
  console.log(`  mdata.customer_quality_events: ${cqeCount} rows, n/a (scoped via customer_id join, no operating_company_id column)`);
  const tb = await trialBalance(client);
  console.log(`  trial balance (all USMCA postings, not just targeted docs): debit=${tb.debit} credit=${tb.credit} postings=${tb.count}`);
  return { counts, tb };
}

async function reportTransportationOrigin(client: pg.Client) {
  console.log("\n=== REPORT ONLY -- TRANSPORTATION-origin trace (does NOT affect what gets deleted) ===");
  const r = await client.query<{ table_name: string; id: string; void_reason: string | null; load_number: string | null }>(
    `
      SELECT 'accounting.expenses' AS table_name, e.id::text, e.void_reason, l.load_number
      FROM accounting.expenses e
      LEFT JOIN mdata.loads l ON l.id = e.load_id
      WHERE e.voided_at IS NOT NULL AND e.operating_company_id = $1
        AND (
          e.void_reason ILIKE '%transportation%'
          OR l.load_number = ANY($2)
        )
    `,
    [USMCA, TRANSP_LOAD_NUMBERS],
  );
  if (r.rows.length === 0) {
    console.log("  0 rows match a TRANSPORTATION-origin void_reason or the 5753/5760-5768 load-number range.");
  } else {
    for (const row of r.rows) {
      console.log(`  ${row.table_name} ${row.id} void_reason="${row.void_reason ?? ""}" load_number=${row.load_number ?? "n/a"}`);
    }
  }
  console.log(`  (reporting only -- ${r.rows.length} row(s) flagged, none excluded from the delete list above)`);
}

// v6 CHANGE: BULK/SET-BASED, BATCHED -- standing bulk-write law (2026-09-28 execution round).
// Every function below operates on an ARRAY of ids with one round-trip per referencing table, never
// a per-row loop. deletePostingsForJeSet replaces the old per-JE deletePostingsForJe.
//
// BUG FOUND BY THE --apply-test-run ROLLBACK PROOF (2026-09-28, same discipline as the owner's own
// one-row rollback proof): a document's postings live under ONE journal_entry_uuid
// (document.journal_entry_id), but when a document is voided, its REVERSAL postings are created
// under a SEPARATE, second journal_entry_uuid (the reversing JE), linked back only at the POSTING
// level via reversal_of_line_id/reversed_by_line_id -- 2,999 such cross-JE pairs confirmed live,
// system-wide. Deleting only the original JE's postings throws a real FK violation from the
// reversing JE's postings still pointing at them. expandJeClosure walks that link (both directions,
// to a fixed point -- normally one hop, since void creates exactly one reversing JE per document,
// but computed as a real closure rather than assumed) so "delete the document and its postings
// together" correctly means the FULL original+reversal trace, not just the original half.
async function expandJeClosure(client: pg.Client, seedJeIds: string[]): Promise<string[]> {
  let all = new Set(seedJeIds);
  let frontier = [...all];
  while (frontier.length > 0) {
    const r = await client.query<{ je: string }>(
      `
        SELECT DISTINCT jep.journal_entry_uuid::text AS je
        FROM accounting.journal_entry_postings jep
        WHERE jep.id IN (
                SELECT reversal_of_line_id FROM accounting.journal_entry_postings
                 WHERE journal_entry_uuid = ANY($1::uuid[]) AND reversal_of_line_id IS NOT NULL
              )
           OR jep.id IN (
                SELECT reversed_by_line_id FROM accounting.journal_entry_postings
                 WHERE journal_entry_uuid = ANY($1::uuid[]) AND reversed_by_line_id IS NOT NULL
              )
           OR jep.reversal_of_line_id IN (
                SELECT id FROM accounting.journal_entry_postings WHERE journal_entry_uuid = ANY($1::uuid[])
              )
           OR jep.reversed_by_line_id IN (
                SELECT id FROM accounting.journal_entry_postings WHERE journal_entry_uuid = ANY($1::uuid[])
              )
      `,
      [frontier],
    );
    const newOnes = r.rows.map((row) => row.je).filter((je) => !all.has(je));
    for (const je of newOnes) all.add(je);
    frontier = newOnes;
  }
  return [...all];
}

async function deletePostingsForJeSet(client: pg.Client, jeIds: string[]): Promise<number> {
  if (jeIds.length === 0) return 0;
  // ROUND 133 (verify-no-unscoped-company-delete) — jeIds arrives pre-filtered to USMCA by every
  // caller above (the script's own documented SCOPE is USMCA-only throughout), but this function
  // is generic and reusable, so belt-and-suspenders: both DELETEs additionally require the
  // journal entry itself to resolve to USMCA via accounting.journal_entries, never trusting the
  // caller's id list alone. neither accounting.transaction_source_links nor
  // accounting.journal_entry_postings carries its own operating_company_id column.
  await client.query(
    `DELETE FROM accounting.transaction_source_links
      WHERE journal_entry_posting_id IN (
        SELECT jep.id FROM accounting.journal_entry_postings jep
          JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
         WHERE jep.journal_entry_uuid = ANY($1::uuid[])
           AND je.operating_company_id = $2::uuid
      )`,
    [jeIds, USMCA],
  );
  const del = await client.query(
    `DELETE FROM accounting.journal_entry_postings
      WHERE journal_entry_uuid = ANY($1::uuid[])
        AND journal_entry_uuid IN (
          SELECT id FROM accounting.journal_entries WHERE operating_company_id = $2::uuid
        )`,
    [jeIds, USMCA],
  );
  return del.rowCount ?? 0;
}

// v5 GENERALIZATION: this was originally getJournalEntryReferencingColumns/deleteJeHeaderIfSafeHusk,
// JE-specific. With the scope now at 24 parent tables -- several (driver_settlements 21 inbound FKs,
// maintenance.work_orders 28, accounting.invoices 14, driver_settlement_deductions 9) carrying FK
// fan-out just as large as journal_entries' 50+ -- hand-classifying every referencing table as
// "owned child, force-delete" vs "reference, leave alone" the way the original 5-table CHILD_TABLES
// map did is no longer a safe use of judgment at this scale; a misclassification on any one of
// dozens of tables is a real risk. So this function is now GENERIC and applies to every target table
// uniformly: live pg_constraint sweep, delete ONLY if every referencing count is zero, otherwise
// report the blocker by name and leave the row untouched. It never force-cascades a reference FK.
// The hand-curated CHILD_TABLES map above is UNCHANGED and still runs FIRST, for the 5 originally-
// analyzed true-owned-detail relationships only (expense_lines, bill_lines-as-bill-child, etc.) --
// this generic sweep runs AFTER those, catching everything else, including on the 19 new tables
// where no CHILD_TABLES entries exist at all (so the generic sweep is the ONLY protection there).
async function getReferencingColumns(
  client: pg.Client,
  parentTable: string,
): Promise<Array<{ childTable: string; childColumn: string; constraintName: string }>> {
  const [schema, table] = parentTable.split(".");
  const r = await client.query<{ child_table: string; child_column: string; conname: string }>(
    `
      SELECT
        con.conrelid::regclass::text AS child_table,
        att_child.attname AS child_column,
        con.conname
      FROM pg_constraint con
      CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS u(child_attnum, parent_attnum, ord)
      JOIN pg_attribute att_child ON att_child.attrelid = con.conrelid AND att_child.attnum = u.child_attnum
      JOIN pg_attribute att_parent ON att_parent.attrelid = con.confrelid AND att_parent.attnum = u.parent_attnum
      JOIN pg_class parent_class ON parent_class.oid = con.confrelid
      JOIN pg_attribute parent_pk ON parent_pk.attrelid = con.confrelid AND parent_pk.attname = 'id'
      WHERE con.contype = 'f'
        AND con.confrelid = ($1 || '.' || $2)::regclass
        AND att_parent.attnum = parent_pk.attnum
    `,
    [schema, table],
  );
  return r.rows.map((row) => ({ childTable: row.child_table, childColumn: row.child_column, constraintName: row.conname }));
}

// Bulk/set-based: ONE query per referencing FK (not per candidate row) returns every id in
// `candidateIds` that is blocked, across all referencing tables at once. The safe set is
// candidateIds minus the union of all blocked sets. Never cascades, never forces.
async function computeBlockedIds(
  client: pg.Client,
  parentTable: string,
  candidateIds: string[],
  refColumns: Array<{ childTable: string; childColumn: string; constraintName: string }>,
): Promise<Map<string, string[]>> {
  const blockedBy = new Map<string, string[]>(); // id -> list of blocker descriptions
  if (candidateIds.length === 0) return blockedBy;
  for (const ref of refColumns) {
    // BUG FOUND BY THE --apply-test-run ROLLBACK PROOF: "id <> ANY($1)" means "not equal to AT
    // LEAST ONE array element" -- true for virtually any 2+-element array, so this never actually
    // excluded same-batch self-references (a classic Postgres gotcha). Caused all 234 JE-husk
    // reversal pairs to falsely block each other, since each pair's own id was (wrongly) never
    // excluded from the array it was being compared against. The correct exclusion is "<> ALL(...)"
    // (equivalently "NOT (id = ANY(...))").
    const selfExclude = ref.childTable === parentTable ? `AND id <> ALL($1::uuid[])` : "";
    const r = await client.query<{ hit: string }>(
      `SELECT DISTINCT ${ref.childColumn} AS hit FROM ${ref.childTable}
        WHERE ${ref.childColumn} = ANY($1::uuid[]) ${selfExclude}`,
      [candidateIds],
    );
    for (const row of r.rows) {
      const list = blockedBy.get(row.hit) ?? [];
      list.push(`${ref.childTable}.${ref.childColumn} (constraint ${ref.constraintName})`);
      blockedBy.set(row.hit, list);
    }
  }
  return blockedBy;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const BATCH_SIZE = 1000;

// Set-based, batched delete. One DELETE...WHERE id = ANY($1) per batch, never a per-row loop.
// Reports rows/elapsed/rate per batch, per the standing bulk-write law.
async function bulkDeleteBatched(client: pg.Client, table: string, ids: string[]): Promise<number> {
  let total = 0;
  for (const batch of chunk(ids, BATCH_SIZE)) {
    const t0 = Date.now();
    // BANK-F431 — NO SILENT DELETES. audit.record_deletions held ZERO rows for
    // banking.bank_transactions after 327 lines were removed, and audit.row_changes carried no action
    // and no changed_by_role, so nothing said which engine or AUTH did it. Written from the SAME id
    // list, in the same transaction, immediately before the DELETE, so it can never describe a
    // different set than the one removed.
    if (table === "banking.bank_transactions") {
      await client.query(recordBankLineDeletionsByIdSql(), [batch, "auth_purge_voided_usmca", AUTH_ID, `BANK-F431 voided purge ${AUTH_ID}`]);
    }
    const res = await client.query(`DELETE FROM ${table} WHERE id = ANY($1::uuid[])`, [batch]);
    const elapsedSec = (Date.now() - t0) / 1000;
    const n = res.rowCount ?? 0;
    total += n;
    console.log(`    batch: ${n} rows in ${elapsedSec.toFixed(2)}s (${elapsedSec > 0 ? (n / elapsedSec).toFixed(1) : "inf"} rows/sec)`);
  }
  return total;
}

async function main() {
  const apply = process.argv.includes("--apply") || process.argv.includes("--apply-test-run");
  const testRun = process.argv.includes("--apply-test-run"); // runs the FULL apply logic for real, then always ROLLBACK -- proves the pipeline executes against live data with zero risk, same discipline as the owner's own one-row rollback proof.

  if (apply && !testRun && process.env.OWNER_AUTH_ID !== AUTH_ID) {
    console.error(`REFUSED: --apply requires OWNER_AUTH_ID=${AUTH_ID} and an OPEN ${AUTH_ID} entry in ` +
      `docs/bus/OWNER-AUTHORIZATIONS.md. Neither is present. Run --dry-run or --apply-test-run instead.`);
    process.exit(1);
  }
  // ROUND 133 P0 — the env-var string match above only proves the CALLER typed the right id; it
  // never confirms AUTH_ID is actually an OPEN, unexpired entry on origin/main. verify-owner-
  // authorization.mjs is the real check (reads docs/bus/OWNER-AUTHORIZATIONS.md AT origin/main,
  // confirms not expired, not withdrawn). AUTH-101 itself is long closed (single-use, already
  // executed 2026-09-28) — this makes a bare re-run of --apply refuse correctly going forward,
  // exactly as it should for a one-time purge.
  if (apply && !testRun) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`ROUND 133 P0: ${AUTH_ID} rejected by verify-owner-authorization.mjs -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
      process.exit(1);
    }
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  if (!apply) {
    await measure(client);
    await reportTransportationOrigin(client);
    console.log("\nDRY RUN ONLY -- no rows changed. Re-run with --apply once AUTH-101 is OPEN and you have personally reviewed this script.");
    await client.end();
    return;
  }

  // --apply path (not exercised by this draft submission).
  const runStart = Date.now();
  await client.query("BEGIN");
  try {
    // SET LOCAL does not support parameterized values ($1) -- PostgreSQL SET only accepts a
    // literal or an identifier, never a bind parameter. set_config(..., true) is the parameterized
    // equivalent of SET LOCAL (is_local=true scopes it to this transaction, same as SET LOCAL).
    await client.query("SELECT set_config('app.purge_auth_id', $1, true)", [AUTH_ID]);
    const before = await measure(client);
    await reportTransportationOrigin(client);

    // Live FK-referencing-column sweep per target table, cached once per table (not per row) --
    // the schema doesn't change mid-transaction, no need to re-query pg_constraint per row.
    const refColumnsByTable = new Map<string, Array<{ childTable: string; childColumn: string; constraintName: string }>>();
    for (const table of TARGET_TABLES) {
      refColumnsByTable.set(table, await getReferencingColumns(client, table));
    }
    const jeRefColumns = refColumnsByTable.get("accounting.journal_entries") ?? [];

    let deletedDocs = 0;
    let deletedChildRows = 0;
    let deletedPostings = 0;
    let deletedJeHeaders = 0;
    const docBlocked: string[] = [];
    const jeHeaderBlocked: string[] = [];
    const allJeIdsTouched: string[] = [];

    for (const table of TARGET_TABLES) {
      const jeCol = JE_LINK_COLUMN[table];
      const children = CHILD_TABLES[table] ?? [];
      const refColumns = refColumnsByTable.get(table) ?? [];
      const rows = await client.query<{ id: string; je_id: string | null }>(
        `SELECT id::text, ${jeCol ? `${jeCol}::text` : "NULL"} AS je_id
           FROM ${table}
          WHERE voided_at IS NOT NULL AND operating_company_id = $1${extraPred(table, table)}`,
        [USMCA],
      );
      const allIds = rows.rows.map((r) => r.id);
      if (allIds.length === 0) continue;
      console.log(`\n  -- ${table}: ${allIds.length} candidate(s) --`);

      // Bulk-compute which candidates are blocked by a live reference (one query per referencing
      // FK, not per row).
      const blockedMap = await computeBlockedIds(client, table, allIds, refColumns);
      const safeIds = allIds.filter((id) => !blockedMap.has(id));
      for (const [id, blockers] of blockedMap) {
        docBlocked.push(`${table} ${id}: ${blockers.join("; ")}`);
      }
      if (safeIds.length === 0) {
        console.log(`    0 safe (all ${allIds.length} blocked)`);
        continue;
      }

      // Owned child/detail rows for the 5 originally-analyzed tables -- bulk delete by FK column,
      // scoped to the safe set only (never touch a document we decided not to delete).
      for (const child of children) {
        const t0 = Date.now();
        const res = await client.query(`DELETE FROM ${child.table} WHERE ${child.fk} = ANY($1::uuid[])`, [safeIds]);
        const el = (Date.now() - t0) / 1000;
        const n = res.rowCount ?? 0;
        deletedChildRows += n;
        console.log(`    child ${child.table}: ${n} rows in ${el.toFixed(2)}s`);
      }

      // Postings for the safe documents' own JEs, bulk. Expanded to the full reversal closure
      // first (see expandJeClosure) -- a document's original JE and its own reversing JE (created
      // at void time) are two DIFFERENT journal_entry_uuid values, linked only at the posting
      // level; both must be deleted together or the still-referenced half throws an FK violation.
      {
        let seedJeIds: string[] = [];
        if (jeCol) {
          seedJeIds = rows.rows.filter((r) => safeIds.includes(r.id) && r.je_id).map((r) => r.je_id as string);
        } else if (SOURCE_TRANSACTION_TYPE[table]) {
          const bySource = await findJeIdsBySourceTransaction(client, SOURCE_TRANSACTION_TYPE[table], safeIds);
          for (const list of bySource.values()) seedJeIds.push(...list);
        }
        if (seedJeIds.length > 0) {
          const jeIds = await expandJeClosure(client, seedJeIds);
          if (jeIds.length > seedJeIds.length) {
            console.log(`    reversal closure: ${seedJeIds.length} seed JE(s) -> ${jeIds.length} total (pulled in ${jeIds.length - seedJeIds.length} reversing JE(s))`);
          }
          const t0 = Date.now();
          const n = await deletePostingsForJeSet(client, jeIds);
          const el = (Date.now() - t0) / 1000;
          deletedPostings += n;
          allJeIdsTouched.push(...jeIds);
          console.log(`    postings for ${jeIds.length} JE(s): ${n} rows in ${el.toFixed(2)}s`);
        }
      }

      const n = await bulkDeleteBatched(client, table, safeIds);
      deletedDocs += n;
      console.log(`    ${table}: ${n} document(s) deleted (${allIds.length - safeIds.length} left in place, blocked)`);
    }

    // mdata.customer_quality_events -- no operating_company_id column, scoped via customers join;
    // its own referencing-column sweep (it has none live per the earlier investigation, but checked
    // for real here, not assumed).
    {
      const cqeRows = await client.query<{ id: string }>(
        `SELECT cqe.id::text FROM mdata.customer_quality_events cqe
           JOIN mdata.customers c ON c.id = cqe.customer_id
          WHERE cqe.voided_at IS NOT NULL AND c.operating_company_id = $1`,
        [USMCA],
      );
      const cqeIds = cqeRows.rows.map((r) => r.id);
      if (cqeIds.length > 0) {
        const cqeRefColumns = await getReferencingColumns(client, "mdata.customer_quality_events");
        const cqeBlockedMap = await computeBlockedIds(client, "mdata.customer_quality_events", cqeIds, cqeRefColumns);
        const cqeSafeIds = cqeIds.filter((id) => !cqeBlockedMap.has(id));
        for (const [id, blockers] of cqeBlockedMap) docBlocked.push(`mdata.customer_quality_events ${id}: ${blockers.join("; ")}`);
        const n = await bulkDeleteBatched(client, "mdata.customer_quality_events", cqeSafeIds);
        deletedDocs += n;
        console.log(`\n  -- mdata.customer_quality_events: ${n} document(s) deleted (${cqeIds.length - n} left in place, blocked) --`);
      }
    }

    // JE-header safe-husk sweep: bulk, over every JE touched this run, using the SAME live
    // referencing-column sweep as the child/document logic above -- never a per-row loop.
    if (allJeIdsTouched.length > 0) {
      const uniqueJeIds = [...new Set(allJeIdsTouched)];
      const postingCounts = await client.query<{ journal_entry_uuid: string; n: string }>(
        `SELECT journal_entry_uuid::text, COUNT(*) AS n FROM accounting.journal_entry_postings
          WHERE journal_entry_uuid = ANY($1::uuid[]) GROUP BY journal_entry_uuid`,
        [uniqueJeIds],
      );
      const stillHasPostings = new Set(postingCounts.rows.map((r) => r.journal_entry_uuid));
      const zeroPostingJeIds = uniqueJeIds.filter((id) => !stillHasPostings.has(id));

      const jeBlockedMap = await computeBlockedIds(client, "accounting.journal_entries", zeroPostingJeIds, jeRefColumns);
      const safeJeIds = zeroPostingJeIds.filter((id) => !jeBlockedMap.has(id));
      for (const [id, blockers] of jeBlockedMap) {
        jeHeaderBlocked.push(`JE ${id}: ${blockers.join("; ")}`);
      }
      for (const id of uniqueJeIds) {
        if (stillHasPostings.has(id)) jeHeaderBlocked.push(`JE ${id}: accounting.journal_entry_postings still has ${postingCounts.rows.find(r=>r.journal_entry_uuid===id)?.n} row(s)`);
      }

      deletedJeHeaders = await bulkDeleteBatched(client, "accounting.journal_entries", safeJeIds);
      console.log(`\n  -- JE header sweep: ${uniqueJeIds.length} touched, ${deletedJeHeaders} removed as true husks, ${uniqueJeIds.length - deletedJeHeaders} left (still referenced or still has postings) --`);
    }

    if (docBlocked.length > 0) {
      console.log(`\n${docBlocked.length} document(s) left in place (still referenced elsewhere, never forced):`);
      for (const line of docBlocked) console.log(`  ${line}`);
    }
    if (jeHeaderBlocked.length > 0) {
      console.log(`\n${jeHeaderBlocked.length} JE header(s) left in place (still referenced elsewhere):`);
      for (const line of jeHeaderBlocked) console.log(`  ${line}`);
    }

    // BUG FOUND BY THE --apply-test-run ROLLBACK PROOF: the original check compared the TOTAL
    // before vs after and rejected any change -- wrong. Deleting a voided document's postings
    // legitimately SHRINKS the total (that's the whole point of the purge); a void's original and
    // reversing legs are each individually balanced, so removing both together always drops
    // debit_total and credit_total by the SAME amount -- the real invariant is that debit still
    // equals credit AFTER, not that the total is unchanged. trg_check_journal_entry_balanced is
    // DEFERRABLE INITIALLY DEFERRED -- fires at COMMIT, this is a second, earlier check.
    const after = await measure(client);
    if (after.tb.debit !== after.tb.credit) {
      throw new Error(
        `TRIAL BALANCE UNBALANCED AFTER PURGE: debit=${after.tb.debit} credit=${after.tb.credit} ` +
          `(before was debit=${before.tb.debit} credit=${before.tb.credit}, itself balanced). ROLLING BACK.`,
      );
    }
    const totalRemoved = BigInt(before.tb.debit) - BigInt(after.tb.debit);
    console.log(`\n  Trial balance still balanced after purge (debit=credit=${after.tb.debit}). ` +
      `Total removed from both sides equally: ${totalRemoved} cents ($${(Number(totalRemoved) / 100).toFixed(2)}).`);

    const orphans = await client.query<{ n: string }>(`
      SELECT COUNT(*) AS n FROM accounting.journal_entry_postings jep
      LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      WHERE je.id IS NULL
    `);
    if (Number(orphans.rows[0].n) !== 0) {
      throw new Error(`ORPHANED POSTINGS: ${orphans.rows[0].n} postings reference a nonexistent journal_entries row. ROLLING BACK.`);
    }

    // Same invariant scripts/verify-no-journal-entry-has-zero-postings.mjs checks, asserted inline
    // before commit -- if this design ever produced a husk despite deleteJeHeaderIfSafeHusk's
    // checks, this is the last line of defense, not just a follow-up CI run.
    const husks = await client.query<{ n: string }>(`
      SELECT COUNT(*) AS n FROM accounting.journal_entries je
      WHERE NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings jep WHERE jep.journal_entry_uuid = je.id)
    `);
    if (Number(husks.rows[0].n) !== 0) {
      throw new Error(`ZERO-POSTING JE HUSK(S) DETECTED: ${husks.rows[0].n}. This design should never produce these. ROLLING BACK.`);
    }

    const totalElapsed = (Date.now() - runStart) / 1000;
    const totalRows = deletedDocs + deletedChildRows + deletedPostings + deletedJeHeaders;
    console.log(
      `\nDeleted ${deletedDocs} documents, ${deletedChildRows} child/detail rows, ${deletedPostings} postings, ${deletedJeHeaders} JE header(s) ` +
      `(${totalRows} rows total) in ${totalElapsed.toFixed(2)}s (${(totalRows / totalElapsed).toFixed(1)} rows/sec overall). ` +
      `Trial balance still balanced. Zero orphans. Zero zero-posting husks.`,
    );
    if (testRun) {
      console.log("\n--apply-test-run: rolling back on purpose. Nothing committed. Pipeline executed clean against live data.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ROLLED BACK:", (e as Error).message);
    console.error((e as Error).stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
