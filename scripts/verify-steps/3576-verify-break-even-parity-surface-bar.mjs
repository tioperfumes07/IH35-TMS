/** Verify-step 3576 — ACCT-F3576 Break-Even expense lines ParityTable surface bar. */
export default {
  name: "verify-break-even-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-break-even-parity-surface-bar.mjs"]);
  },
};
