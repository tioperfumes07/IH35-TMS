export default {
  name: "verify-no-session-scoped-rls-bypass",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-session-scoped-rls-bypass.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-session-scoped-rls-bypass.mjs"]);
  },
};
