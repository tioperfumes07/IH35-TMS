export default {
  name: "verify-legal-matter-claim-picker-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-matter-claim-picker-create.mjs"]);
  },
};
