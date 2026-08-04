export default {
  name: "verify-docs-verify-01",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-docs-verify-01.mjs"]);
  },
};
