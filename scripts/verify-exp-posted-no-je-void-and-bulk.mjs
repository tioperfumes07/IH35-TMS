#!/usr/bin/env node
/**
 * EXP-POSTED-NO-JE-01 (owner-verified live 2026-09-01). Three records presented a posted-ish
 * state with zero postings (accounting.expenses 8a1b3d84, $75.00; accounting.bills
 * BILL-2026-00018 $750.00 and BILL-2026-00019 $300.00) and could never be voided --
 * "No posted batch found to reverse", correctly, since nothing was ever posted. This guard locks
 * three things:
 *
 *   (a) both void paths (expenses.routes.ts, bills.service.ts) handle a never-posted document as
 *       a status change + audit entry, never a fabricated reversal, and never a bare refusal that
 *       leaves the record permanently unvoidable.
 *   (b) the shared bulk fail-stop runner (bulk-update.factory.ts) pre-validates every row BEFORE
 *       running the real atomic pass, reporting every blocked row (not just the first) so a
 *       resubmit can deselect them -- closing the "0 of 11 succeeded; 1 failed" class the owner
 *       hit live.
 *   (c) accounting.expenses carries a CHECK (NOT VALID) making posting_status='posted' with a
 *       NULL journal_entry_id impossible going forward (accounting.bills has no equivalent
 *       columns -- its gap was purely in the void path's assumption, already covered by (a)).
 *
 *   node scripts/verify-exp-posted-no-je-void-and-bulk.mjs
 *   node scripts/verify-exp-posted-no-je-void-and-bulk.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-exp-posted-no-je-void-and-bulk";
const EXPENSES_FILE = "apps/backend/src/accounting/expenses.routes.ts";
const BILLS_FILE = "apps/backend/src/accounting/bills.service.ts";
const HELPER_FILE = "apps/backend/src/accounting/expense-void-reversal.ts";
const VOID_SERVICE_FILE = "apps/backend/src/accounting/expense-void.service.ts";
const BULK_FILE = "apps/backend/src/bulk/bulk-update.factory.ts";
const MIGRATION_FILE = "db/migrations/202613310500_expenses_bills_posted_requires_je_check_not_valid.sql";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(expensesSrc, billsSrc, bulkSrc, migrationSrc, helperSrc, voidServiceSrc = read(VOID_SERVICE_FILE)) {
  const errs = [];
  if (!expensesSrc) return [`${EXPENSES_FILE}: missing`];

  // ACCT-F4431310 (2026-10-12) — re-pointed, same intent, stricter.
  //   old rule: the route catches PostingEngineError SOURCE_NOT_FOUND from an 'expense'-only reversal and falls through to
  //             a status-only void.
  //   new rule: the route calls reverseExpenseDocumentInClientTx, which decides POSITIVELY what is live for the document
  //             (its own 'expense' lines + a fuel receipt's 'fuel_event' entry): nothing live -> a status-only void (still
  //             never a fabricated reversal); something live -> reversed; any reversal error propagates (no catch).
  //   why: the SOURCE_NOT_FOUND catch also swallowed the fuel receipt case — a voided fuel receipt document kept its JE live.
  // 443.192 / LEAD 13:00Z — re-pointed, same rule: de3de55e09 (443.136 follow-up, ACCT-F4431371) moved the route's void
  //   into the ONE in-transaction expense void, voidExpenseDocumentInClientTx (expense-void.service.ts), shared with the
  //   Owner duplicate-purchase repair. The void path is now route -> that service -> reverseExpenseDocumentInClientTx, so
  //   both hops are required: the route delegates to the service, and the service reverses through the one reverser.
  const reversesDirectly = /await reverseExpenseDocumentInClientTx\(client(?: as never)?, \{/.test(expensesSrc);
  const delegates = /\bvoidExpenseDocumentInClientTx\(client(?: as never)?, \{/.test(expensesSrc);
  const serviceReverses = Boolean(voidServiceSrc) && /await reverseExpenseDocumentInClientTx\(client(?: as never)?, \{/.test(voidServiceSrc);
  if (!reversesDirectly && !(delegates && serviceReverses)) {
    errs.push(`${EXPENSES_FILE}: expense void must reverse through reverseExpenseDocumentInClientTx (every live posting of the document) — directly or via ${VOID_SERVICE_FILE} voidExpenseDocumentInClientTx`);
  }
  for (const [file, src] of [[EXPENSES_FILE, expensesSrc], [VOID_SERVICE_FILE, voidServiceSrc ?? ""]]) {
    if (/SOURCE_NOT_FOUND"\) throw revErr|code !== "SOURCE_NOT_FOUND"/.test(src)) {
      errs.push(`${file}: expense void must not catch SOURCE_NOT_FOUND — "nothing posted" is decided by reading, never by swallowing a reversal error`);
    }
  }
  if (voidServiceSrc && /\bcatch\b/.test(voidServiceSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))) {
    errs.push(`${VOID_SERVICE_FILE}: a reversal error must never be swallowed in the void (no catch)`);
  }
  if (helperSrc !== undefined) {
    if (!helperSrc) errs.push(`${HELPER_FILE}: missing`);
    else {
      if (!/if \(live\.expense_source_live\) \{/.test(helperSrc)) errs.push(`${HELPER_FILE}: the document's own 'expense' lines must be reversed only when live (an unposted document is a status-only void, never a fabricated reversal)`);
      if (!/for \(const fillId of live\.fuel_event_sources\)[\s\S]{0,200}entityType: "fuel_event"/.test(helperSrc)) errs.push(`${HELPER_FILE}: a fuel receipt document's live 'fuel_event' entry must be reversed (postVoidReversal fuel_event)`);
      if (/\bcatch\b/.test(helperSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))) errs.push(`${HELPER_FILE}: a reversal error must never be swallowed (no catch)`);
    }
  }

  if (!billsSrc) errs.push(`${BILLS_FILE}: missing`);
  else {
    // Both voidBillPaymentInClientTx (ACCT-F327, pre-existing) and voidBillInClientTx (this fix)
    // now share this exact pre-check shape — require it to appear at least twice.
    const hasPostedBatchCount = (billsSrc.match(/const hasPostedBatch = Boolean\(postedBatchRes\.rows\[0\]\?\.exists\)/g) ?? []).length;
    if (hasPostedBatchCount < 2) {
      errs.push(`${BILLS_FILE}: voidBillInClientTx must pre-check for an existing posted batch (mirroring ACCT-F327's bill_payments pattern) before attempting a reversal`);
    }
    if (!/source_transaction_type = 'bill'\\?[\s\S]{0,80}source_transaction_id = \$2::text/.test(billsSrc) && !/source_transaction_type = 'bill'\s*\n\s*AND source_transaction_id = \$2::text/.test(billsSrc)) {
      errs.push(`${BILLS_FILE}: the bill pre-check must query journal_entry_postings by source_transaction_type='bill'`);
    }
    if (!/reversal\?\.journal_entry_id \?\? null/.test(billsSrc)) {
      errs.push(`${BILLS_FILE}: voidBillInClientTx's reversal result must be read null-safely (reversal can now legitimately be null)`);
    }
  }

  if (!bulkSrc) errs.push(`${BULK_FILE}: missing`);
  else {
    if (!/class BulkPreValidationError extends Error/.test(bulkSrc)) {
      errs.push(`${BULK_FILE}: BulkPreValidationError is missing`);
    }
    if (!/throw new BulkPreValidationError\(preValidationFailures, ids\.length\)/.test(bulkSrc)) {
      errs.push(`${BULK_FILE}: the pre-validation pass must throw BulkPreValidationError with EVERY blocked row when any row fails, before the real pass runs`);
    }
    if (!/err instanceof BulkPreValidationError/.test(bulkSrc)) {
      errs.push(`${BULK_FILE}: the HTTP layer must handle BulkPreValidationError distinctly from BulkFailStopError`);
    }
    if (!/ROLLBACK TO SAVEPOINT \$\{safeProbe\}/.test(bulkSrc)) {
      errs.push(`${BULK_FILE}: the probe pass must unconditionally roll back its savepoint (success or failure alike) -- it must never persist`);
    }
    if (!/try\s*\{[\s\S]*enforceBulkRateLimit[\s\S]*finally\s*\{[\s\S]*releaseBulkInFlight/.test(bulkSrc)) {
      errs.push(`${BULK_FILE}: enforceBulkRateLimit must live inside try/finally with releaseBulkInFlight (SEL-02)`);
    }
  }

  if (!migrationSrc) errs.push(`${MIGRATION_FILE}: missing`);
  else if (!/CHECK \(posting_status <> 'posted' OR journal_entry_id IS NOT NULL\)\s*\n\s*NOT VALID/.test(migrationSrc)) {
    errs.push(`${MIGRATION_FILE}: accounting.expenses must carry the posted-requires-journal_entry_id CHECK, added NOT VALID`);
  }

  return errs;
}

function selftest() {
  const goodExpenses = read(EXPENSES_FILE) ?? "";
  const goodBills = read(BILLS_FILE) ?? "";
  const goodBulk = read(BULK_FILE) ?? "";
  const goodMigration = read(MIGRATION_FILE) ?? "";
  const goodHelper = read(HELPER_FILE) ?? "";
  const goodVoidService = read(VOID_SERVICE_FILE) ?? "";
  const goodErrs = assertGuard(goodExpenses, goodBills, goodBulk, goodMigration, goodHelper, goodVoidService);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    ["bad1-expense-void-bypasses-helper", assertGuard(goodExpenses, goodBills, goodBulk, goodMigration, goodHelper, goodVoidService.replace("await reverseExpenseDocumentInClientTx(client as never, {", "await somethingElse(client as never, {"))],
    ["bad1-route-bypasses-void-service", assertGuard(goodExpenses.replace("voidExpenseDocumentInClientTx(client as never, {", "somethingElse(client as never, {"), goodBills, goodBulk, goodMigration, goodHelper, goodVoidService)],
    ["bad1f-void-service-swallows-reversal-error", assertGuard(goodExpenses, goodBills, goodBulk, goodMigration, goodHelper, goodVoidService.replace("const reversingJeId = rev.reversal_journal_entry_id;", "try { void 0; } catch { /* x */ }\n  const reversingJeId = rev.reversal_journal_entry_id;"))],
    ["bad1b-expense-void-swallows-source-not-found", assertGuard(goodExpenses + '\nif (revErr.code !== "SOURCE_NOT_FOUND") throw revErr;', goodBills, goodBulk, goodMigration, goodHelper)],
    ["bad1c-helper-fabricates-reversal-when-nothing-live", assertGuard(goodExpenses, goodBills, goodBulk, goodMigration, goodHelper.replace("if (live.expense_source_live) {", "if (true) {"))],
    ["bad1d-helper-skips-fuel-receipt", assertGuard(goodExpenses, goodBills, goodBulk, goodMigration, goodHelper.replace('entityType: "fuel_event", entityId: fillId', 'entityType: "expense", entityId: fillId'))],
    ["bad1e-helper-swallows-reversal-error", assertGuard(goodExpenses, goodBills, goodBulk, goodMigration, goodHelper.replace("for (const fillId of live.fuel_event_sources) {", "for (const fillId of live.fuel_event_sources) { try { void 0; } catch { /* x */ }"))],
    ["bad2-bill-void-not-fixed", assertGuard(goodExpenses, goodBills.replace("const hasPostedBatch = Boolean(postedBatchRes.rows[0]?.exists);\n\n  const reversal = hasPostedBatch", "const hasPostedBatch = true;\n\n  const reversal = hasPostedBatch"), goodBulk, goodMigration)],
    ["bad3-bill-reversal-not-null-safe", assertGuard(goodExpenses, goodBills.replace(/reversal\?\.journal_entry_id \?\? null/g, "reversal.journal_entry_id"), goodBulk, goodMigration)],
    ["bad4-no-prevalidation-error-class", assertGuard(goodExpenses, goodBills, goodBulk.replace(/class BulkPreValidationError extends Error/g, "class RemovedError extends Error"), goodMigration)],
    ["bad5-prevalidation-not-thrown", assertGuard(goodExpenses, goodBills, goodBulk.replace(/throw new BulkPreValidationError\(preValidationFailures, ids\.length\);/g, "// removed"), goodMigration)],
    ["bad6-http-layer-not-wired", assertGuard(goodExpenses, goodBills, goodBulk.replace(/err instanceof BulkPreValidationError/g, "false"), goodMigration)],
    ["bad7-probe-not-rolled-back", assertGuard(goodExpenses, goodBills, goodBulk.replace(/ROLLBACK TO SAVEPOINT \$\{safeProbe\}/g, "REMOVED"), goodMigration)],
    ["bad8-migration-check-missing", assertGuard(goodExpenses, goodBills, goodBulk, goodMigration.replace(/NOT VALID;/g, ";"))],
  ];

  for (const [name, res] of mutations) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS ${mutations.length}/${mutations.length} mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errs = assertGuard(read(EXPENSES_FILE), read(BILLS_FILE), read(BULK_FILE), read(MIGRATION_FILE), read(HELPER_FILE));
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — never-posted expenses/bills void as a status change (no fabricated reversal), bulk fail-stop pre-validates every row before running, and posted-with-no-JE is now impossible for expenses`);
