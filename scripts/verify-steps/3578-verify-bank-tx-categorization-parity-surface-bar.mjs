/** Verify-step 3578 — BANK-F3578 bank tx categorization ParityTable surface bar. */
export default {
  name: "verify-bank-tx-categorization-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-tx-categorization-parity-surface-bar.mjs"]);
  },
};
