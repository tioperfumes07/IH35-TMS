export default {
  name: "verify-no-approval-holds",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-approval-holds.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-approval-holds.mjs"]);
  },
};
