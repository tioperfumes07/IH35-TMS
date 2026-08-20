#!/usr/bin/env node
/**
 * GUARD: a migration that VOIDS a financial row must also reverse that row's GL. ACCT-F251.
 *
 * I built this because I caused the defect. ACCT-F142
 * (202612230000_bills_void_reason_and_tms_native_duplicate_guard.sql) voided duplicate vendor bills in
 * raw SQL so a partial unique index could install:
 *
 *     UPDATE accounting.bills b SET voided_at = now(), ...
 *
 * Correct intent, correct void-not-delete form — and it never touched the ledger. Measured on prod
 * br-fancy-credit-akjnd07a: THREE bills carry that migration's exact void_reason and identical
 * voided_at 2026-08-07 00:33:50.999787+00, and each still has a LIVE, unreversed journal entry:
 * CC3-BILL-20260806-01 $743.21 (JE 811cb8bc), TEST-BILL-0806-A $450.00 twice (570ba3b6, faeccb0d).
 * $1,643.21 of expense and A/P sit on USMCA's books for bills that are void.
 *
 * WHY A MIGRATION GUARD AND NOT A ROUTE GUARD. The application void path is fine — every bill voided
 * through the app has a matching reversal JE, and CC-3's #4953/#4962 already assert that route code
 * writes both void columns. This class is different and no existing guard sees it: a migration runs as
 * raw SQL, bypasses the void service entirely, and therefore bypasses postVoidReversal. The service
 * layer cannot defend the database from a DDL/DML file that never calls it.
 *
 * THE ALLOWLIST IS NOT AN EXCUSE LIST. Applied migrations are checksum-frozen and must never be edited
 * (that is its own law), so the seven pre-existing files are recorded here by name rather than fixed in
 * place. ACCT-F142 is the known offender among them and its DATA damage is tracked separately as
 * ACCT-F251 — the rows still need a reversal posted through the canonical poster, which is an owner
 * decision because it writes to posted GL. The allowlist exists so this guard can fail on the NEXT one.
 *
 * Run:  node scripts/verify-migration-void-reverses-gl.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(root, "db/migrations");
const LABEL = "verify-migration-void-reverses-gl";

/** Record-level financial tables whose void must be mirrored in the ledger. */
const MONEY_TABLES = ["bills", "invoices", "payments", "bill_payments", "vendor_credits", "credit_memos"];

/**
 * Pre-existing at the time this guard was written. Frozen by checksum, so they are recorded, not
 * edited. New entries are NOT routine — adding one means accepting stranded GL.
 */
export const ALLOWLIST = new Map([
  ["0060_p3_t11_20_1_accounting_invoices_schema.sql", "schema definition; introduces the void columns"],
  ["0123_p6_pre_ledger_drift_reconciliation.sql", "pre-ledger drift reconciliation, predates the posting engine"],
  ["0124_p6_active_drift_reconciliation.sql", "pre-ledger drift reconciliation, predates the posting engine"],
  ["202607021800_arap_clone_source.sql", "QBO clone-source import; parallel books, no TMS JE exists to reverse"],
  ["202610080000_acct_link_03_bill_unit_memo_backfill.sql", "memo/unit backfill; does not transition void state"],
  [
    "202612230000_bills_void_reason_and_tms_native_duplicate_guard.sql",
    "ACCT-F142 — THE KNOWN OFFENDER. Stranded $1,643.21 across 3 bills; data damage tracked as ACCT-F251, needs an owner-approved reversal through the canonical poster.",
  ],
  ["202612330000_void_state_authoritative_bills_invoices.sql", "adds the void-state CHECK; does not void rows"],
]);

export function stripSqlComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Does this SQL void a money row? */
export function voidsMoneyRow(sql) {
  const clean = stripSqlComments(sql);
  const re = new RegExp(
    `UPDATE\\s+accounting\\.(${MONEY_TABLES.join("|")})\\b([\\s\\S]{0,1500}?)(?:;|$)`,
    "gi"
  );
  let m;
  while ((m = re.exec(clean)) !== null) {
    const body = m[2];
    // Only the SET clause can TRANSITION a row to void — a WHERE clause merely READS existing void
    // state (e.g. `WHERE status = 'void' AND voided_at IS NULL`, a metadata-only backfill on rows
    // that are already void, filling one marker set from the other without touching amounts or
    // status). Scanning the whole body misreads that read-filter as a write. Split on the first
    // top-level WHERE so only the SET clause is checked.
    const whereMatch = /\bWHERE\b/i.exec(body);
    let setClause = whereMatch ? body.slice(0, whereMatch.index) : body;

    // ACCT-F5622-GUARD-FALSE-POSITIVE — a CASE branch of the exact form
    // `WHEN <alias>.status = 'void' THEN 'void'` PRESERVES an already-void row's status (it only
    // re-derives 'void' when the row's CURRENT status already equals 'void'); by construction it can
    // never transition a non-void row TO void, so it is not a write any more than the WHERE-clause
    // read-filter carved out above. This is the exact shape of
    // 202612821200_acct_f5622_payment_void_recompute_unapplied_filter.sql's trigger-function
    // rewrite (`status = CASE WHEN i.status = 'void' THEN 'void' WHEN ... END`), which the guard was
    // misreading as a voiding write. Strip only this self-referential preserve branch before testing
    // — a real void hiding in a CASE (any branch not gated on the column already being 'void') keeps
    // its literal `status = 'void'` text and is still caught.
    setClause = setClause.replace(/WHEN\s+[\w.]+\.status\s*=\s*'void'\s+THEN\s+'void'/gi, "");

    if (/\bvoided_at\s*=\s*(now\(\)|CURRENT_TIMESTAMP|\$)/i.test(setClause) || /\bstatus\s*=\s*'void'/i.test(setClause)) {
      return true;
    }
  }
  return false;
}

/** Does it also reverse the ledger — or explicitly assert there is nothing to reverse? */
export function reversesGl(sql) {
  const clean = stripSqlComments(sql);
  return (
    /accounting\.journal_entries/i.test(clean) ||
    /reverses_je_id|reversed_by_je_id|reversal_of_line_id/i.test(clean) ||
    /postVoidReversal/i.test(clean)
  );
}

export function collectProblems(files) {
  const problems = [];
  for (const { name, sql } of files) {
    if (!voidsMoneyRow(sql)) continue;
    if (reversesGl(sql)) continue;
    if (ALLOWLIST.has(name)) continue;
    problems.push(
      `${name}: voids a row in accounting.{${MONEY_TABLES.join("|")}} but never touches ` +
        `accounting.journal_entries. A migration runs as raw SQL, so it bypasses the void service and ` +
        `therefore bypasses the GL reversal — the document goes void while its expense/revenue and its ` +
        `A/P or A/R stay live on the books. This is ACCT-F142's exact mistake, which stranded $1,643.21 ` +
        `(ACCT-F251). Reverse the journal entries in the same migration, or state in the migration why ` +
        `no JE exists to reverse.`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const mk = (name, sql) => [{ name, sql }];

  const OFFENDER = "UPDATE accounting.bills b SET voided_at = now(), void_reason = 'dup' WHERE x;";
  if (collectProblems(mk("209912310000_new.sql", OFFENDER)).length !== 1) {
    failures.push("a NEW migration voiding bills without reversing GL was NOT caught");
  }

  // Same offence, but it reverses the ledger too -> allowed.
  if (
    collectProblems(
      mk("209912310000_new.sql", OFFENDER + " INSERT INTO accounting.journal_entries (memo) VALUES ('reversal');")
    ).length !== 0
  ) {
    failures.push("a migration that DOES reverse the GL was wrongly flagged");
  }

  // status='void' is the other half of the biconditional and must count.
  if (
    collectProblems(mk("209912310000_new.sql", "UPDATE accounting.invoices SET status = 'void' WHERE id=$1;"))
      .length !== 1
  ) {
    failures.push("status='void' was not treated as voiding");
  }

  // The frozen pre-existing files must stay green.
  if (collectProblems(mk("202612230000_bills_void_reason_and_tms_native_duplicate_guard.sql", OFFENDER)).length !== 0) {
    failures.push("an allowlisted pre-existing migration was flagged");
  }

  // A comment must not trip it, and must not excuse it.
  if (collectProblems(mk("209912310000_new.sql", "-- UPDATE accounting.bills SET voided_at = now();")).length !== 0) {
    failures.push("a COMMENTED-OUT void was flagged");
  }
  if (
    collectProblems(mk("209912310000_new.sql", OFFENDER + "\n-- accounting.journal_entries handled elsewhere"))
      .length !== 1
  ) {
    failures.push("a COMMENT claiming the JE is handled elsewhere excused the offence — false green");
  }

  // A non-money table is not this guard's business.
  if (collectProblems(mk("209912310000_new.sql", "UPDATE mdata.loads SET voided_at = now();")).length !== 0) {
    failures.push("a non-money table was flagged");
  }

  // A WHERE-clause READ filter on status='void' (rows already void) is not a write — the real shape
  // of 202612480900_bills_sync_void_markers.sql, which backfills one marker set from the other on
  // rows that are already void without transitioning anything. Must NOT be flagged.
  const backfillOnAlreadyVoid =
    "UPDATE accounting.bills SET voided_at = COALESCE(voided_at, revoked_at), revoked_at = COALESCE(revoked_at, voided_at) WHERE status = 'void' AND (voided_at IS NULL OR revoked_at IS NULL);";
  if (collectProblems(mk("209912310000_new.sql", backfillOnAlreadyVoid)).length !== 0) {
    failures.push("a WHERE-clause read filter on status='void' (metadata backfill on already-void rows) was wrongly flagged as a new void");
  }

  // The same real shape, but the SET clause DOES actually transition status too — must still be
  // caught; the WHERE-only exemption must not become a blanket escape hatch for a real void hiding
  // behind an innocuous-looking WHERE clause.
  const realVoidWithWhere =
    "UPDATE accounting.bills SET status = 'void', voided_at = now() WHERE vendor_id = $1;";
  if (collectProblems(mk("209912310000_new.sql", realVoidWithWhere)).length !== 1) {
    failures.push("a real void (SET status='void' before WHERE) was NOT caught");
  }

  // ACCT-F5622-GUARD-FALSE-POSITIVE — the real shape of
  // 202612821200_acct_f5622_payment_void_recompute_unapplied_filter.sql: a trigger-function
  // recompute that PRESERVES an already-void invoice's status via `WHEN i.status = 'void' THEN
  // 'void'`, never a transition. Must NOT be flagged.
  const preserveExistingVoidInCase =
    "UPDATE accounting.invoices i SET amount_paid_cents = v_paid, status = CASE WHEN i.status = 'void' THEN 'void' WHEN i.status = 'factored' THEN 'factored' WHEN v_paid >= i.total_cents THEN 'paid' ELSE i.status END, updated_at = now() WHERE i.id = v_invoice_id;";
  if (collectProblems(mk("209912310000_new.sql", preserveExistingVoidInCase)).length !== 0) {
    failures.push("a CASE branch that only PRESERVES an already-void row's status (WHEN status='void' THEN 'void') was wrongly flagged as a new void");
  }

  // The strip must be surgical: a genuine transition sitting in the SAME SET clause, alongside a
  // harmless preserve-existing-void branch, must still be caught.
  const preserveVoidPlusRealTransitionElsewhere =
    "UPDATE accounting.invoices i SET status = CASE WHEN i.status = 'void' THEN 'void' ELSE i.status END, void_reason = 'dup' WHERE i.id = $1; UPDATE accounting.invoices SET status = 'void' WHERE vendor_id = $2;";
  if (collectProblems(mk("209912310000_new.sql", preserveVoidPlusRealTransitionElsewhere)).length !== 1) {
    failures.push("a real void transition alongside an unrelated preserve-existing-void branch was NOT caught — the strip must not become a blanket escape hatch");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 11/11 (new offender caught, GL-reversing migration allowed, status='void' ` +
      `counted, allowlist honoured, commented-out void ignored, comment cannot excuse, non-money ` +
      `ignored, WHERE-clause read filter on already-void rows not flagged, real void behind a WHERE ` +
      `clause still caught, CASE preserve-existing-void branch not flagged, real transition alongside ` +
      `a preserve branch still caught)`
  );
  process.exit(0);
}

if (!fs.existsSync(MIGRATIONS)) {
  console.error(`${LABEL} FAIL — ${MIGRATIONS} is missing.`);
  process.exit(1);
}
const files = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS, name), "utf8") }));

const problems = collectProblems(files);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} migration(s) void money rows and strand their GL:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — ${files.length} migrations scanned; no new migration voids a financial row without ` +
    `reversing its journal entries (${ALLOWLIST.size} pre-existing files allowlisted by name).`
);
