// BANK-18-KEYSTONE — Rule-17 verify-step wrapper for the categorize-capable register guard.
// Root cause of the block reading NEEDS-VERIFY ("2/4 signature file(s)"): the reconciler looked for
// RegisterTable.tsx / RegisterRow.tsx that were never built — the KEYSTONE rewire consolidated onto the
// single BankingTransactionsDesignView surface (guard asserts only ONE live categorize table exists).
// The guard was already wired in .github/workflows/locked-guards.yml; this step auto-discovers it for
// verify:pre-commit too (Rule 17 — no package.json / locked-guards / ci hot-file edits).
export default {
  name: "banking-register-categorize-capable",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-banking-register-categorize-capable.mjs", "--selftest"]) !== 0) {
      return 1;
    }
    if (ctx.run("node", ["scripts/verify-banking-register-categorize-capable.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
