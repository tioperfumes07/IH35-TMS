export default {
  name: "verify-reports-cancellations-by-date-iso-chrome",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-cancellations-by-date-iso-chrome.mjs"]);
  },
};
