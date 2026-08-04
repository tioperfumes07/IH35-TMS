// BANK-F602 — Cash posting KPI cents→dollars scale must match Cash Flow authoritative total.
export default {
  name: "banking-cash-posting-cents-scale",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-cash-posting-cents-scale.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-cash-posting-cents-scale.mjs"]);
  },
};
