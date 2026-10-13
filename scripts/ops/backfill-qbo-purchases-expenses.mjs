#!/usr/bin/env node
/**
 * REFUSED — ACCT-F4431381 (Lead 443.137 item 9e, part 2). QuickBooks is a READ-ONLY ARCHIVE.
 *
 * This one-shot used to project the QuickBooks mirror mdata.qbo_purchases into the native ledger
 * (accounting.expenses + accounting.expense_lines). That is a QuickBooks -> native money write, which the owner ruling forbids:
 * native tables are the source of truth, and QuickBooks rows stay in their mirror. The scheduler's
 * equivalent stage (projectPurchasesToExpenses) already refuses by name (part 1, PR #26728).
 *
 * The projection SQL has been removed, not disabled, so no flag, argument or environment variable can
 * re-arm it. The script exits 1 with the refusal before it reads any argument or opens any connection.
 * Native records are created only through the TMS service layer.
 *
 * Guard: scripts/verify-qbo-paths-never-write-native-tables.mjs (R6 — scripts/ops QBO backfills refuse
 * and carry no native write).
 */
console.error(
  "QBO_NATIVE_WRITE_REFUSED: scripts/ops/backfill-qbo-purchases-expenses.mjs is retired. QuickBooks is a read-only " +
    "archive (Lead 443.137 item 9e); a QBO backfill may not write native tables (accounting.expenses + accounting.expense_lines). " +
    "Create native records through the TMS service layer."
);
process.exit(1);
