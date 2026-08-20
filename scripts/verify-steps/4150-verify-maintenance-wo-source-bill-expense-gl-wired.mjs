// verify-steps wrapper for scripts/verify-maintenance-wo-source-bill-expense-gl-wired.mjs
// (WAVE 2 maintenance money — WO source/bill/expense/gl cluster, verify-step 4150). Static, no DB —
// same shape as verify-steps/4149-*.mjs and siblings.
export default {
  name: "verify-maintenance-wo-source-bill-expense-gl-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-wo-source-bill-expense-gl-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-wo-source-bill-expense-gl-wired.mjs"]);
  },
};
