export default {
  name: "verify-reports-scheduled-canonical-sor",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-scheduled-canonical-sor.mjs"]);
  },
};
