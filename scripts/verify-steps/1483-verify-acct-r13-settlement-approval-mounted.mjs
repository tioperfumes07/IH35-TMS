export default {
  name: "verify-acct-r13-settlement-approval-mounted",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-r13-settlement-approval-mounted.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-acct-r13-settlement-approval-mounted.mjs"]);
  },
};
