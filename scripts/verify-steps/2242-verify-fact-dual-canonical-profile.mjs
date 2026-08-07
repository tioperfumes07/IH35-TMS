export default {
  name: "verify-fact-dual-canonical-profile",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fact-dual-canonical-profile.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fact-dual-canonical-profile.mjs"]);
  },
};
