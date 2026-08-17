export default {
  name: "verify-reports-scheduled-status-datetime-chrome",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-scheduled-status-datetime-chrome.mjs"]);
  },
};
