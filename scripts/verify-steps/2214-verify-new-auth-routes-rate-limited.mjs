export default {
  name: "verify-new-auth-routes-rate-limited",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-new-auth-routes-rate-limited.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-new-auth-routes-rate-limited.mjs"]);
  },
};
