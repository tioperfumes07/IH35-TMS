// verify-steps wrapper for scripts/verify-bank-split-vendor-prefills-default-expense-account.mjs —
// VEND-F-SILENT-BILL-GL-UI: BankTransactionSplitModal.tsx's multi-vendor picker must prefill
// gl_account_id from the vendor's default_expense_account_id, matching the Driver/Product-Service
// pickers already in the same file. Static, no DB.
export default {
  name: "verify-bank-split-vendor-prefills-default-expense-account",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-split-vendor-prefills-default-expense-account.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-split-vendor-prefills-default-expense-account.mjs"]);
    ctx.run("node", ["scripts/verify-vendor-default-expense-account-type-enforced.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-default-expense-account-type-enforced.mjs"]);
  },
};
