// LINK-F5189 — expense Required-column honesty audit, batch 1 (accounting + maintenance +
// cash-flow + fuel + home + insurance + reports + safety + vendors). Also resets the
// verify-wave-c-expense-fe-all-modules.mjs inventory floors from stale 57/13/11 to the
// verified honest 21/9/5.
// (verify-step 3365 — CC-1 band, claimed in commit 7e54fe83e "FINDING: claim verify-step
// 3365 (cc-1 band)" #7019).
export default {
  name: "expense-required-honest-batch1",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-required-honest-batch1.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expense-required-honest-batch1.mjs"]);
    ctx.run("node", ["scripts/verify-wave-c-expense-fe-all-modules.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-wave-c-expense-fe-all-modules.mjs"]);
  },
};
