/** Verify-step 3564 — SYS-F3564 system module ParityTable surface bar. */
export default {
  name: "verify-system-module-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-system-module-parity-surface-bar.mjs"]);
    // BANK-F91461 — E-41 Engine status board (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-e41-engine-status-board.mjs", "--selftest"]);
  },
};
