export default {
  name: "verify-border-wizard-step6-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-border-wizard-step6-entitylinks.mjs"]);
  },
};
