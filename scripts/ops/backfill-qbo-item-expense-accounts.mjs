#!/usr/bin/env node
/**
 * REFUSED — ACCT-F4431381 (Lead 443.137 item 9e, part 2). QuickBooks is a READ-ONLY ARCHIVE.
 *
 * This one-shot used to set the native item catalog's default expense account (catalogs.items
 * default_expense_account_id) from the QuickBooks item mirror mdata.qbo_items (ExpenseAccountRef). That is a
 * QuickBooks -> native master write, which the owner ruling forbids: native tables are the source of truth,
 * and QuickBooks rows stay in their mirror. The items puller's equivalent write was removed in part 1
 * (PR #26728) and the items reconciler refuses by name.
 *
 * The update SQL has been removed, not disabled, so no flag, argument or environment variable can re-arm
 * it. The script exits 1 with the refusal before it reads any argument or opens any connection. A native
 * item's default expense account is set through Lists > Items in the TMS.
 *
 * Guard: scripts/verify-qbo-paths-never-write-native-tables.mjs (R6 — scripts/ops QBO backfills refuse
 * and carry no native write).
 */
console.error(
  "QBO_NATIVE_WRITE_REFUSED: scripts/ops/backfill-qbo-item-expense-accounts.mjs is retired. QuickBooks is a " +
    "read-only archive (Lead 443.137 item 9e); a QBO backfill may not write native tables (catalogs.items). " +
    "Set an item's default expense account through the TMS item catalog."
);
process.exit(1);
