export default {
  name: "verify-legal-matter-insurance-lawsuit-picker-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-matter-insurance-lawsuit-picker-create.mjs"]);
  },
};
