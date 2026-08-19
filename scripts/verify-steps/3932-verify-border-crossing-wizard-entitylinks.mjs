export default {
  name: "verify-border-crossing-wizard-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-border-crossing-wizard-entitylinks.mjs"]);
  },
};
