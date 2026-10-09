export default {
  name: "verify-reports-ifta-runner-duplicate-policy-chrome",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-ifta-runner-duplicate-policy-chrome.mjs"]);
    await ctx.run("node", ["scripts/verify-91094-toc-venddup-wizreclass-slate-leftover-chrome.mjs"]);
  },
};
