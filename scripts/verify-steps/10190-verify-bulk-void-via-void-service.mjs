export default {
  name: "verify-bulk-void-via-void-service",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bulk-void-via-void-service.mjs"]);
  },
};
