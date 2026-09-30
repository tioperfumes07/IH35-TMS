// DOCUMENT INTEGRITY (2026-09-30, Lead order) -- the engine fix's own guard. Asserts
// expense_lines_item_id_required and expense_lines_expense_account_required both exist and the
// live null-item / null-account counts never grow past their known, grandfathered legacy
// baselines (120 item_id, 0 expense_account_uuid).
export default {
  name: "verify:expense-line-item-and-account-required",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-line-item-and-account-required.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expense-line-item-and-account-required.mjs"]);
  },
};
