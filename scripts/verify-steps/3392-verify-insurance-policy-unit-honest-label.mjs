export default {
  name: "verify-insurance-policy-unit-honest-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-insurance-policy-unit-honest-label.mjs"]);
  },
};
