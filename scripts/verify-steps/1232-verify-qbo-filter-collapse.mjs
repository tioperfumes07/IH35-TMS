/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-qbo-filter-collapse",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-filter-collapse.mjs"]);
  },
};
