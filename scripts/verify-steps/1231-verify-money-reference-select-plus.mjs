/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-money-reference-select-plus",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-money-reference-select-plus.mjs"]);
  },
};
