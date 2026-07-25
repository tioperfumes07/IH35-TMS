export default {
  name: "verify-acct-surf-07-register",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surf-07-register.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-surf-07-register.mjs"]);
  },
};
