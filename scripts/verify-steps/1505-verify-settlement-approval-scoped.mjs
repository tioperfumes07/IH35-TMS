export default {
  name: "verify-settlement-approval-scoped",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-approval-scoped.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-settlement-approval-scoped.mjs"]);
  },
};
