/**
 * R-178 (Lead, 2026-09-25) — fuel expense engine line satisfies the item qty/rate check; numbering skips taken numbers.
 * Verify-step 11605, claude band.
 */
export default {
  name: "verify-fuel-expense-line-and-number-engine",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-expense-line-and-number-engine.mjs"]);
  },
};
