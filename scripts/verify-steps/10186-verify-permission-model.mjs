export default {
  name: "verify-permission-model",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-permission-model.mjs"]);
  },
};
