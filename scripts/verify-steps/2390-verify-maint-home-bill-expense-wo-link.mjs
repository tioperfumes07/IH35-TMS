export default {
  name: "verify-maint-home-bill-expense-wo-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-home-bill-expense-wo-link.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-maint-home-bill-expense-wo-link.mjs"]);
    // BANK-F91448 — C-36 Maintenance 16 tabs → 9 (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c36-maint-tabs-16-to-9.mjs", "--selftest"]);
  },
};
