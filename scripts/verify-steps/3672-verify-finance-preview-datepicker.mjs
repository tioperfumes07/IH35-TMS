export default {
  name: "verify-finance-preview-datepicker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-preview-datepicker.mjs"]);
  },
};
