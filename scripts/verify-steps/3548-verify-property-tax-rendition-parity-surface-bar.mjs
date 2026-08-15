/** Verify-step 3548 — COMP-F3548 property tax rendition lines ParityTable surface bar. */
export default {
  name: "verify-property-tax-rendition-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-property-tax-rendition-parity-surface-bar.mjs"]);
  },
};
