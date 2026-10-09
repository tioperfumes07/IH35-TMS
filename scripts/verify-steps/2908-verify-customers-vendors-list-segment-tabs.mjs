export default {
  name: "verify-customers-vendors-list-segment-tabs",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customers-vendors-list-segment-tabs.mjs"]);
    await ctx.run("node", ["scripts/verify-invariant23-list-view-single-line-name.mjs"]);
    await ctx.run("node", ["scripts/verify-91186-telematics-anomaly-slate-leftover-chrome.mjs"]);
  },
};
