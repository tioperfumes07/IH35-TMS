// verify-steps wrapper for scripts/verify-expenses-list-void-affordance.mjs
// (LV-EXPENSE-VOID-UNREACHABLE / EXPENSE-VOID-AFFORDANCE, verify-step 3127).
//
// ROOT CAUSE this closes: the base guard has existed on main since PR #5706 (which built the
// expense void button + VoidReasonModal on both ExpensesListPage and ExpenseDetailPage) but was
// NEVER wired into scripts/verify-steps/ — an orphan guard that runs on nobody's CI, the exact
// class this session already fixed twice (CI-ORPHAN-GUARDS-BANK-CATEGORIZE-AND-BILLS-NULL,
// CI-DIST-COVERAGE). `node scripts/verify-expenses-list-void-affordance.mjs` has no --selftest mode
// (unlike most guards this session's wrappers wrap) — it is a pure static assertion against the two
// real files, so this wrapper runs it once, matching the base script's own contract.
export default {
  name: "verify-expenses-list-void-affordance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expenses-list-void-affordance.mjs"]);
  },
};
