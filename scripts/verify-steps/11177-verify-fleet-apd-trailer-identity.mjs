export default {
  name: "verify-fleet-apd-trailer-identity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-apd-trailer-identity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fleet-apd-trailer-identity.mjs"]);
  },
};
