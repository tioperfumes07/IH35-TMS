export default {
  name: "verify-fact-profile-canonical-factor",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fact-profile-canonical-factor.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fact-profile-canonical-factor.mjs"]);
  },
};
