// ROUND 360 (CC-2) — shared pieces of the bank feed state machine guards.
// Spec: docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md
//
// Every guard here runs UNSCOPED across every company EXCEPT the frozen one (OWNER RULING 2026-10-02: TRANSPORTATION is
// not read, not written — 00-OWNER-RULING-2026-10-02-CC2-ACCEPTED-PLUS-FOUR-RULINGS.md §3), which each report names.
// Every guard here runs under SET LOCAL app.bypass_rls = 'lucia' inside a READ ONLY
// transaction, prints is_lucia_bypass() so a scoped run can never pass for an unscoped one, and fails closed when the
// database is unreachable or returns zero bank lines (an empty result is an instrument claim, not a pass).

/** Every column through which a bank line claims a document. */
export const LINK_COLUMNS = [
  "matched_advance_id",
  "matched_bill_id",
  "matched_bill_payment_id",
  "matched_expense_id",
  "matched_factoring_advance_id",
  "matched_fuel_transaction_id",
  "matched_invoice_id",
  "matched_journal_entry_id",
  "matched_load_id",
  "matched_payment_id",
  "matched_relay_fuel_transaction_id",
  "matched_settlement_id",
  "matched_transfer_id",
  "linked_entity_id",
];

/** SQL: the line carries a document (same predicate as banking.bank_line_classify()). */
export const LINKED_SQL = (a = "bt") =>
  `(num_nonnulls(${LINK_COLUMNS.map((c) => `${a}.${c}`).join(", ")}) > 0 OR ${a}.status IN ('split', 'transfer') OR ${a}.transfer_kind IS NOT NULL)`;

/** Companies no seat reads or writes (owner ruling). */
export const FROZEN_COMPANY_CODES = ["TRANSP"];
/** SQL: the row's company is not frozen. `col` is the operating_company_id expression. */
export const NOT_FROZEN_SQL = (col = "bt.operating_company_id") =>
  `${col} NOT IN (SELECT id FROM org.companies WHERE code = ANY('{${FROZEN_COMPANY_CODES.join(",")}}'::text[]))`;

export const THE_THREE_TABS = ["for_review", "categorized", "excluded"];

/**
 * Run `fn(client)` READ ONLY, unscoped. Returns its value. Exits 1 (fail closed) on any connection or query failure.
 * Pass { needsBucket: true } to fail when migration 202615350600 has not been applied yet.
 */
export async function withUnscopedReadOnly(label, fn) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${label}: FAIL — needs DATABASE_URL (live, unscoped). A guard that cannot look is not a pass.`);
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
  try {
    await c.connect();
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const bypass = (await c.query("SELECT identity.is_lucia_bypass() AS b")).rows[0].b;
    const total = Number((await c.query(`SELECT count(*) AS n FROM banking.bank_transactions bt WHERE ${NOT_FROZEN_SQL()}`)).rows[0].n);
    if (total === 0) {
      console.error(`${label}: FAIL — 0 bank lines read (bypass=${bypass}); an empty result is an instrument problem, not a pass`);
      process.exit(1);
    }
    const hasBucket = (await c.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema = 'banking' AND table_name = 'bank_transactions' AND column_name IN ('review_bucket', 'resolution_kind')`
    )).rows[0].n === 2;
    const out = await fn(c, { total, hasBucket, bypass });
    await c.query("ROLLBACK");
    return { ...out, total, hasBucket, bypass };
  } catch (err) {
    console.error(`${label}: FAIL — live check could not run: ${err.message}`);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
}

/** The bucket a line sits in: the column once 202615350600 is applied; before it, what the classifier will assign. */
export const BUCKET_SQL = (hasBucket, a = "bt") =>
  hasBucket
    ? `${a}.review_bucket`
    : `(CASE WHEN ${LINKED_SQL(a)} THEN 'categorized'
             WHEN ${a}.excluded_reason IS NOT NULL OR ${a}.skip_reason IS NOT NULL OR ${a}.status = 'skipped' OR ${a}.review_state = 'excluded' THEN 'excluded'
             ELSE 'for_review' END)`;

export function report(label, fails, okLine) {
  if (fails.length) {
    console.error(`${label}: FAIL\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${label}: PASS — ${okLine} [not read: ${FROZEN_COMPANY_CODES.join(", ")} — frozen by owner ruling]`);
}
