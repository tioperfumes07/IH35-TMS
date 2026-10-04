export default {
  name: "verify:customers-detail-tabs-url-sync",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customers-detail-tabs-url-sync.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-customers-detail-tabs-url-sync.mjs"]);
    // BANK-F91467 — R319 Customer Details engines (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-r319-customer-details-engines.mjs", "--selftest"]);
  },
};
