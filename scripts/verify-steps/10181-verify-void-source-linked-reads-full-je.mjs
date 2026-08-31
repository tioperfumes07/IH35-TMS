export default {
  name: "verify-void-source-linked-reads-full-je",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-void-source-linked-reads-full-je.mjs"]);
  },
};
