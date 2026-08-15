/** Verify-step 3568 — ACCT-F3568 AP aging by-type ParityTable surface bar. */
export default {
  name: "verify-ap-aging-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ap-aging-parity-surface-bar.mjs"]);
  },
};
