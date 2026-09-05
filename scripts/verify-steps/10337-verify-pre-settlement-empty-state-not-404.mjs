export default {
  name: "verify-pre-settlement-empty-state-not-404",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pre-settlement-empty-state-not-404.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-pre-settlement-empty-state-not-404.mjs"]);
    await ctx.run("node", ["scripts/verify-presettlement-empty-state-200.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-presettlement-empty-state-200.mjs"]);
    await ctx.run("node", ["scripts/verify-escrow-accrues-per-load-not-per-settlement.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-escrow-accrues-per-load-not-per-settlement.mjs"]);
    await ctx.run("node", ["scripts/verify-settlement-costs-never-consolidated.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-costs-never-consolidated.mjs"]);
  },
};
