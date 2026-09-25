#!/usr/bin/env node
// READ-ONLY. Full action-matrix classification for the R-153.6/153.7 step-3 remediation, one row
// per fuel_id in docs/bus/fuel-truth-2026-09-25.csv. No writes. Determines, per row, exactly one
// of a small set of well-defined remediation actions so the write script has no ambiguity.
import fs from "node:fs";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const csvPath = new URL("../../docs/bus/fuel-truth-2026-09-25.csv", import.meta.url);
const csvLines = fs.readFileSync(csvPath, "utf8").trim().split("\n");
const rows = csvLines.slice(1).map((line) => {
  const firstComma = line.indexOf(",");
  const fuelId = line.slice(0, firstComma);
  const rest = line.slice(firstComma + 1);
  const bucket = rest.split(",")[0];
  return { fuelId, bucket };
});
const ids = rows.map((r) => r.fuelId);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
await client.query("BEGIN");
await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
await client.query(`SELECT set_config('app.operating_company_id', '${USMCA}', true)`);
await client.query("SET TRANSACTION READ ONLY");

// Live wrong-1090 JE per fuel_id (via transaction_source_links -> journal_entry_postings).
const jeRes = await client.query(
  `SELECT tsl.linked_object_id AS fuel_id, je.id::text AS je_id, jep.id::text AS posting_line_id,
          coa.account_number AS credit_account_code
   FROM accounting.transaction_source_links tsl
   JOIN accounting.journal_entry_postings jep ON jep.id = tsl.journal_entry_posting_id
   JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
   LEFT JOIN catalogs.accounts coa ON coa.id = jep.account_id
   WHERE tsl.linked_object_type = 'fuel_event'
     AND tsl.linked_object_id = ANY($1::text[])
     AND jep.debit_or_credit = 'credit'
     AND jep.reversed_by_line_id IS NULL
     AND je.voided_at IS NULL AND je.status = 'posted'`,
  [ids],
);
const jeByFuel = new Map(jeRes.rows.map((r) => [r.fuel_id, r]));

// Existing accounting.expenses row per fuel_id (any status, including void). A fuel_id can now
// have MORE THAN ONE row (an old voided one + a fresh recreate) -- always prefer the live
// (non-voided) row over a voided one when picking which row represents current state.
const expRes = await client.query(
  `SELECT e.source_fuel_transaction_id::text AS fuel_id, e.id::text AS expense_id, e.status,
          e.posting_status, e.payment_account_uuid::text AS payment_account_uuid,
          coa.account_number AS payment_account_code, e.journal_entry_id::text AS journal_entry_id,
          e.voided_at
   FROM accounting.expenses e
   LEFT JOIN catalogs.accounts coa ON coa.id = e.payment_account_uuid
   WHERE e.source_fuel_transaction_id = ANY($1::uuid[])
   ORDER BY (e.voided_at IS NULL) DESC, e.created_at DESC`,
  [ids],
);
const expByFuel = new Map();
for (const row of expRes.rows) {
  if (!expByFuel.has(row.fuel_id)) expByFuel.set(row.fuel_id, row);
}

// ORPHAN CHECK, found live 2026-09-25: any live wrong-1090 fuel JE whose fuel_id is NOT in the
// 391-row truth-set at all. Discovered: 11 fuel_transactions archived in a single batch
// (2026-09-24T18:58:45Z, unrelated to this remediation) still carry a live wrong-1090 JE that was
// never cleaned up when the row was archived. Archived = superseded/invalid, so these are voided
// only, never reposted (createExpenseFromFuelTransaction already refuses an archived source).
const orphanRes = await client.query(
  `SELECT tsl.linked_object_id AS fuel_id, je.id::text AS je_id, ft.archived_at IS NOT NULL AS is_archived
     FROM accounting.transaction_source_links tsl
     JOIN accounting.journal_entry_postings jep ON jep.id = tsl.journal_entry_posting_id
     JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
     LEFT JOIN catalogs.accounts coa ON coa.id = jep.account_id
     LEFT JOIN fuel.fuel_transactions ft ON ft.id::text = tsl.linked_object_id
    WHERE tsl.linked_object_type = 'fuel_event'
      AND jep.debit_or_credit = 'credit'
      AND jep.reversed_by_line_id IS NULL
      AND je.voided_at IS NULL AND je.status = 'posted' AND je.reversed_by_je_id IS NULL
      AND je.operating_company_id = $2::uuid
      AND coa.account_number = '1090'
      AND NOT (tsl.linked_object_id = ANY($1::text[]))`,
  [ids, USMCA],
);

await client.query("COMMIT");
await client.end();

for (const o of orphanRes.rows) {
  rows.push({ fuelId: o.fuel_id, bucket: o.is_archived ? "ARCHIVED_ORPHAN" : "UNKNOWN_ORPHAN" });
  jeByFuel.set(o.fuel_id, { je_id: o.je_id, fuel_id: o.fuel_id });
}

const buckets = {};
const detail = [];
for (const r of rows) {
  const je = jeByFuel.get(r.fuelId) ?? null;
  const exp = expByFuel.get(r.fuelId) ?? null;
  let action;
  if (r.bucket === "ARCHIVED_ORPHAN" || r.bucket === "UNKNOWN_ORPHAN") {
    // Outside the 391-row truth-set entirely (archived/superseded, or unexplained) -- void the
    // wrong JE only, never repost (nothing valid to repost against).
    action = "ORPHAN_VOID_JE_ONLY";
  } else if (r.bucket === "VOID_DUPLICATE") {
    // BUG FOUND 2026-09-25, fixed here: a duplicate that ALSO has a live wrong-1090 JE (no expense
    // document ever created for it) was previously left completely untouched -- this bucket only
    // ever checked the expense, never the JE. A duplicate is never reposted, but its wrong JE still
    // needs voiding like every other row; only the recreate step is skipped for a duplicate.
    const expNeedsVoid = exp && !exp.voided_at;
    action = je
      ? (expNeedsVoid ? "VOID_DUPLICATE_expense_and_je_need_void" : "VOID_DUPLICATE_je_needs_void_only")
      : (expNeedsVoid ? "VOID_DUPLICATE_expense_needs_void" : "VOID_DUPLICATE_already_clean");
  } else if (exp && !exp.voided_at && je && exp.journal_entry_id === je.je_id) {
    // TRAP CASE, found live 2026-09-25: the expense LOOKS correct (payment_account_uuid set to
    // 1295/2510) but it ADOPTED the still-live wrong-1090 JE -- the account on the expense
    // document is descriptive metadata only for an adopted document (see
    // fuel-expense-document.service.ts's own comment); the REAL posting is whatever the adopted
    // JE actually credits, which is still 1090 here. Must be treated exactly like the
    // adopted-wrong-JE case: void both, then recreate once no live JE remains.
    action = "EXPENSE_ADOPTED_WRONG_JE_void_je_and_expense_then_recreate";
  } else if (exp && !exp.voided_at && (exp.payment_account_code === "2510" || exp.payment_account_code === "1295")) {
    // Live expense already correctly resolved (fresh draft-path create, not an adopt of the wrong
    // JE -- the trap case above is checked first). A live wrong JE surviving alongside this is
    // NOT a double-post when the expense's own journal_entry_id is NULL -- 3 pre-existing rows
    // (created 2026-09-24 03:28, before this session's fuel-fix work) have exactly this shape:
    // status='posted'/posting_status='unposted'/journal_entry_id=NULL, correctly aimed at 2510/
    // 1295 already, genuinely unlinked to the wrong JE (found only via transaction_source_links,
    // an entirely separate old direct-posting-path artifact). Void just the JE; leave the
    // already-correct expense document alone -- whether it later gets drained by the normal
    // posting path is a separate, pre-existing question this remediation does not own.
    action = je && exp.journal_entry_id
      ? "UNCLASSIFIED_needs_manual_review"
      : je
        ? "PRE_EXISTING_CORRECT_EXPENSE_VOID_JE_ONLY"
        : "EXPENSE_ALREADY_CORRECT_no_op";
  } else if (je) {
    // A live wrong-1090 JE exists -- this is the blocking case REGARDLESS of whether the current
    // expense row (if any) is void, missing, or itself pointing at the same wrong JE. Must void
    // the JE (and the stale expense, if live) before a fresh create can land correctly.
    action = exp && !exp.voided_at
      ? "EXPENSE_ADOPTED_WRONG_JE_void_je_and_expense_then_recreate"
      : "NO_EXPENSE_HAS_WRONG_JE_void_then_create";
  } else if (!exp || exp.voided_at) {
    action = !exp ? "NO_EXPENSE_NO_JE_create_fresh" : "EXPENSE_ALREADY_VOID_needs_recreate";
  } else {
    action = "UNCLASSIFIED_needs_manual_review";
  }
  buckets[action] = (buckets[action] || 0) + 1;
  detail.push({ ...r, je_id: je?.je_id ?? null, credit_code: je?.credit_account_code ?? null,
    expense_id: exp?.expense_id ?? null, expense_status: exp?.status ?? null,
    pay_acct_code: exp?.payment_account_code ?? null, action });
}

console.log("Action buckets (must sum to", rows.length, "):");
console.log(buckets);
console.log("sum:", Object.values(buckets).reduce((a, b) => a + b, 0));

const unclassified = detail.filter((d) => d.action === "UNCLASSIFIED_needs_manual_review");
if (unclassified.length) {
  console.log("--- UNCLASSIFIED rows (need manual review) ---");
  console.log(JSON.stringify(unclassified, null, 2));
}

fs.writeFileSync(
  new URL("../../docs/bus/fuel-remediation-classification-2026-09-25.json", import.meta.url),
  JSON.stringify(detail, null, 2),
);
console.log("Wrote docs/bus/fuel-remediation-classification-2026-09-25.json —", detail.length, "rows.");
