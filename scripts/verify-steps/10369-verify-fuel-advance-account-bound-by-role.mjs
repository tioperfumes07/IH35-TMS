export default {
  name: "verify-fuel-advance-account-bound-by-role",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-advance-account-bound-by-role.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-advance-account-bound-by-role.mjs"]);
  },
};
