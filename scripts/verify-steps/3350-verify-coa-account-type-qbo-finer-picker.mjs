export default {
  name: "verify-coa-account-type-qbo-finer-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-coa-account-type-qbo-finer-picker.mjs"]);
  },
};
