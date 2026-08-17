export default {
  name: "verify-maint-wo-create-primary-opens",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-wo-create-primary-opens.mjs"]);
  },
};
