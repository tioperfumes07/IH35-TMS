export default {
  name: "verify-management-report-package-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-management-report-package-print-letter.mjs"]);
  },
};
