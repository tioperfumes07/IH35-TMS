/**
 * ROUND 138 (owner order, via Lead relay, P0) — THE ONE CASCADE VOID ENGINE.
 *
 * ROOT CAUSE this closes: voiding a parent document never cascaded to its own detail/line
 * children. Live-measured before this file existed, USMCA, 2026-09-23: 0 live invoices but 119
 * live invoice_lines under voided parents; 0 live bills but 28 live bill_lines; 0 live
 * settlements but 706 live settlement_lines under voided parents (plus deductions/escrow rows
 * with the same shape). A parent stamped voided while its own children stay live is not a void —
 * it is the SAME class of defect ROUND 131.2 found between the void-stamp write path and the
 * purge-window gate's own liveness column, one level deeper (a document's own detail rows,
 * instead of a whole table).
 *
 * THIS IS NOT A SEVENTH GL ENGINE. It never posts, reverses, or computes GL math itself. Every
 * dollar-bearing parent (invoice/expense/bill/fuel_transaction/factoring_advance/load/
 * journal_entry) still reverses through exactly one of the six existing reversal engines, called
 * by its EXISTING caller (dispatch/cancellation.service.ts's VOID-CASCADE-* blocks, the
 * governance executors, the E10 runner) BEFORE this engine runs. This engine's ONLY job is: once
 * a parent is confirmed voided (stampDocumentVoided already ran, or the parent's own void write
 * for driver_settlement/driver_bill/company_settlement families that predate stampDocumentVoided),
 * walk its own line/detail children and stamp EACH child's OWN liveness column -- never a
 * guessed one, read from this file's own CASCADE_CHILDREN config, which is cross-checked against
 * scripts/purge/usmca-purge-expected-zero.generated.json by
 * scripts/verify-void-cascades-to-every-child.mjs's static arm, the same defensive shape as every
 * other per-family liveness declaration this session (void-document-stamp.service.ts's
 * voidStatusValue/livenessColumn, this file's own CASCADE_CHILDREN).
 *
 * A CHILD WITH NO LIVENESS COLUMN OF ITS OWN (this config's `livenessColumn: null`) is NOT
 * silently skipped -- it is explicitly declared dead-by-inheritance, per
 * usmca-purge-expected-zero.generated.json's own stated law: "live_predicate = null means the
 * table carries NO void flag at all... liveness is answered by its parent document." Nothing is
 * written to that child row; its liveness is definitionally the parent's.
 *
 * TWO TABLES DELIBERATELY EXCLUDED, NOT GUESSED: accounting.invoice_disputes and
 * driver_finance.escrow_balances. The purge-spec JSON declares both `status <> 'voided'` as their
 * live_predicate, but their OWN live CHECK constraints (checked directly, not assumed, before
 * writing this file) make 'voided' an ILLEGAL value for either column
 * (invoice_disputes_status_check: 'open'|'resolved'|'cancelled' only;
 * escrow_balances_status_check: 'active'|'releasing'|'released' only) -- writing 'voided' to
 * either would throw a constraint violation, the EXACT class of bug ROUND 122 found and fixed
 * elsewhere. This is a real mismatch between the JSON and the live schema, not something this
 * engine can safely resolve by guessing a different value -- named here, reported in the PR, not
 * silently worked around.
 *
 * TWO MORE TABLES DEFERRED, NOT GUESSED: driver_finance.driver_liabilities and
 * driver_finance.deduction_schedule. Checked directly: neither carries a direct, unambiguous FK
 * back to driver_finance.driver_settlements -- driver_liabilities links via a polymorphic
 * `origin_id`/`reference_doc_id` pair (not a settlement_id column), and deduction_schedule links
 * to driver_liabilities.id, one more hop removed. Forcing either into this recursive tree via an
 * assumed join would be exactly the "never a guessed column" violation this whole engine exists
 * to prevent. Left out of CASCADE_CHILDREN; needs its own, separately-reasoned design.
 */

export type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type CascadeParentFamily = "invoice" | "bill" | "expense" | "fuel_transaction" | "factoring_advance" | "driver_settlement" | "company_settlement";

type ChildSpec = {
  schema: string;
  table: string;
  /** The FK column on this child row that points at its parent's id. */
  fkColumn: string;
  /**
   * The column to stamp on this child when its parent voids, or null when the table carries no
   * liveness column of its own (its liveness is inherited from the parent, nothing is written).
   */
  livenessColumn: string | null;
  /** How to write livenessColumn: a timestamp set to now(), or a status column set to a literal. */
  writeKind: "timestamp" | null;
  /** Nested children of THIS child (e.g. invoice -> invoice_disputes -> nothing further). */
  children?: ChildSpec[];
};

/**
 * FIXED, INDEPENDENT config -- every entry verified against live information_schema.columns (FK
 * existence) and either usmca-purge-expected-zero.generated.json (livenessColumn) or a live
 * pg_get_constraintdef check (for any status-based column, none currently used here -- every
 * timestamp-column child verified safe; the two status-based tables the JSON named are excluded
 * above, not guessed).
 */
export const CASCADE_CHILDREN: Record<CascadeParentFamily, ChildSpec[]> = {
  invoice: [
    { schema: "accounting", table: "invoice_lines", fkColumn: "invoice_id", livenessColumn: "soft_deleted_at", writeKind: "timestamp" },
    { schema: "accounting", table: "payment_applications", fkColumn: "invoice_id", livenessColumn: null, writeKind: null },
  ],
  bill: [
    { schema: "accounting", table: "bill_lines", fkColumn: "bill_id", livenessColumn: "voided_at", writeKind: "timestamp" },
    { schema: "accounting", table: "bill_payments", fkColumn: "bill_id", livenessColumn: null, writeKind: null },
  ],
  expense: [
    { schema: "accounting", table: "expense_lines", fkColumn: "expense_id", livenessColumn: null, writeKind: null },
    { schema: "expense_attribution", table: "expense_load_links", fkColumn: "expense_id", livenessColumn: null, writeKind: null },
  ],
  fuel_transaction: [],
  factoring_advance: [
    { schema: "accounting", table: "factoring_reserve_movements", fkColumn: "factoring_advance_id", livenessColumn: null, writeKind: null },
    { schema: "accounting", table: "factoring_lifecycle_posting_keys", fkColumn: "factoring_advance_id", livenessColumn: null, writeKind: null },
    { schema: "accounting", table: "factoring_default_interest_accruals", fkColumn: "factoring_advance_id", livenessColumn: null, writeKind: null },
  ],
  driver_settlement: [
    {
      schema: "driver_finance",
      table: "settlement_lines",
      fkColumn: "settlement_id",
      livenessColumn: "voided_at",
      writeKind: "timestamp",
    },
    {
      schema: "driver_finance",
      table: "driver_settlement_deductions",
      fkColumn: "applied_to_settlement_id",
      livenessColumn: "voided_at",
      writeKind: "timestamp",
    },
    { schema: "driver_finance", table: "escrow_ledger", fkColumn: "settlement_id", livenessColumn: null, writeKind: null },
    { schema: "driver_finance", table: "driver_settlement_gl_bills", fkColumn: "settlement_id", livenessColumn: null, writeKind: null },
    { schema: "driver_finance", table: "driver_settlement_gl_runs", fkColumn: "settlement_id", livenessColumn: null, writeKind: null },
    { schema: "driver_finance", table: "settlement_payment_events", fkColumn: "settlement_id", livenessColumn: null, writeKind: null },
    { schema: "driver_finance", table: "settlement_contract_lines", fkColumn: "settlement_id", livenessColumn: null, writeKind: null },
  ],
  company_settlement: [
    {
      schema: "accounting",
      table: "company_settlement_driver_settlements",
      fkColumn: "company_settlement_id",
      livenessColumn: null,
      writeKind: null,
    },
  ],
};

export type CascadeChildResult = { schema: string; table: string; rowsStamped: number };

/**
 * Cascade a parent void down to its OWN registered children, recursively. Runs on the CALLER's
 * transaction client -- same contract as stampDocumentVoided and every reversal engine in this
 * codebase: the caller owns BEGIN/COMMIT/ROLLBACK. Idempotent by construction (every write is
 * `WHERE <fk> = $1 AND <livenessColumn> IS NULL`, so a re-run only touches rows still live).
 *
 * FAIL LOUD, NEVER SILENT: if a child table in the config does not exist live (schema drift), this
 * throws rather than silently skipping -- the caller's transaction rolls back, the parent stays
 * un-cascaded rather than half-voided. Matches this codebase's own "a child that won't reverse
 * aborts its whole parent" law.
 */
export async function cascadeVoidChildren(
  client: QueryableClient,
  parentFamily: CascadeParentFamily,
  parentId: string,
  operatingCompanyId: string
): Promise<CascadeChildResult[]> {
  const specs = CASCADE_CHILDREN[parentFamily];
  if (!specs) {
    throw new Error(`cascadeVoidChildren: "${parentFamily}" has no registered CASCADE_CHILDREN entry (fail loud, never silent).`);
  }
  const results: CascadeChildResult[] = [];
  for (const spec of specs) {
    const qualified = `${spec.schema}.${spec.table}`;
    if (spec.livenessColumn && spec.writeKind === "timestamp") {
      const res = await client.query<{ id: string }>(
        `UPDATE ${qualified}
            SET ${spec.livenessColumn} = now()
          WHERE ${spec.fkColumn} = $1::uuid
            AND operating_company_id = $2::uuid
            AND ${spec.livenessColumn} IS NULL
          RETURNING id::text`,
        [parentId, operatingCompanyId]
      );
      results.push({ schema: spec.schema, table: spec.table, rowsStamped: res.rows.length });
    } else {
      // No liveness column on this child -- dead-by-inheritance, per the JSON's own law. Nothing
      // written, but still reported (rowsStamped: 0 is meaningful -- "covered, nothing to write"
      // is different from "not in the config at all").
      results.push({ schema: spec.schema, table: spec.table, rowsStamped: 0 });
    }
  }
  return results;
}
