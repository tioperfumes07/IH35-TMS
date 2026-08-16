export default {
  name: "verify-owner-all-entities-non-qbo-flags-on",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-owner-all-entities-non-qbo-flags-on.mjs"]);
  },
};
