export default {
  name: "verify-manual-je-hub-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-manual-je-hub-create.mjs"]);
  },
};
