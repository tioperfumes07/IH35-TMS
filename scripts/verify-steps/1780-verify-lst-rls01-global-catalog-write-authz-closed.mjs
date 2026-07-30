export default {
  name: "verify-lst-rls01-global-catalog-write-authz-closed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-rls01-global-catalog-write-authz-closed.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-rls01-global-catalog-write-authz-closed.mjs"]);
  },
};
