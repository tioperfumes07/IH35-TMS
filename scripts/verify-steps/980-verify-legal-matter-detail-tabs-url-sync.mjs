export default {
  name: "verify:legal-matter-detail-tabs-url-sync",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-matter-detail-tabs-url-sync.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-legal-matter-detail-tabs-url-sync.mjs"]);
    // BANK-F91473 — clean-app legal fixtures in complete-delete (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-clean-app-legal-fixtures-in-complete-delete.mjs", "--selftest"]);
  },
};
