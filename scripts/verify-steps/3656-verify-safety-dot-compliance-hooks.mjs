export default {
  name: "verify-safety-dot-compliance-hooks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-dot-compliance-hooks.mjs"]);
  },
};
