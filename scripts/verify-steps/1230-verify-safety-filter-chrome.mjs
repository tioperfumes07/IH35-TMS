/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-safety-filter-chrome",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-filter-chrome.mjs"]);
  },
};
