export default {
  name: "verify-driver-settlements-domain-linkage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-settlements-domain-linkage.mjs"]);
  },
};
