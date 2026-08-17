export default {
  name: "verify-reports-ifta-runner-duplicate-policy-chrome",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-ifta-runner-duplicate-policy-chrome.mjs"]);
  },
};
