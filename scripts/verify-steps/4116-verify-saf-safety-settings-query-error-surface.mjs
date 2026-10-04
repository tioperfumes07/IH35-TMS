export default {
  name: "verify-saf-safety-settings-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-safety-settings-query-error-surface.mjs"]);
    // BANK-F91494 leftover fontSize: 10 + BANK-F91550 leftover slate class refuse (11425 is ODD).
    await ctx.run("node", ["scripts/verify-customer-tab-bar-position-and-data-dot.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-customer-tab-bar-position-and-data-dot.mjs"]);
  },
};
