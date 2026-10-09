export default {
  name: "verify-fleet-oos-status-filter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-oos-status-filter.mjs"]);
    await ctx.run("node", ["scripts/verify-91078-settle-closetrip-escrowpend-slate-leftover-chrome.mjs"]);
  },
};
