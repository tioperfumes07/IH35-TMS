export default {
  name: "verify-invoice-pipeline-proforma-to-factoring",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-pipeline-proforma-to-factoring.mjs"]);
  },
};
