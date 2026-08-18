export default {
  name: "verify-reports-ap-aging-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-ap-aging-print-letter.mjs"]);
  },
};
