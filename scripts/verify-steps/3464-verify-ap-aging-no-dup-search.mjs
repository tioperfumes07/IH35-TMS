export default {
  name: "verify-ap-aging-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ap-aging-no-dup-search.mjs"]);
    // BANK leftover refuse — FeatureFlagsManager / AdminPage / UserDetail house tokens
    await ctx.run("node", ["scripts/verify-91279-admin-flags-user-slate-leftover-chrome.mjs"]);
  },
};
