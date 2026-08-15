export default {
  name: "verify-audit-report-je-subject-type",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-audit-report-je-subject-type.mjs"]);
  },
};
