export default {
  name: "verify-lst-maint01-reseed-rls-safe",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-maint01-reseed-rls-safe.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-maint01-reseed-rls-safe.mjs"]);
  },
};
