export default {
  name: "verify:customer-vendor-detail-url-sort",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-vendor-detail-url-sort.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-customer-vendor-detail-url-sort.mjs"]);
    // BANK-F91466 — R319 Vendor Detail engines (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-r319-vendor-engines.mjs", "--selftest"]);
  },
};
