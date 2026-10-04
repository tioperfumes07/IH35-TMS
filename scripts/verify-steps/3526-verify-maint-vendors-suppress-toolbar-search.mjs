/** Verify-step 3526 — MAINT-F3526 maintenance vendors duplex Search suppress. */
export default {
  name: "verify-maint-vendors-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-vendors-suppress-toolbar-search.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-maint-vendors-suppress-toolbar-search.mjs"]);
    // BANK-F91475 — C-22 tabs + KPIs (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c22-tabs-kpis.mjs", "--selftest"]);
  },
};
