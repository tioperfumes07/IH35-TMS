export default {
  name: "2966-verify-usmca-app-path-list-apis",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-usmca-app-path-list-apis.mjs"]);
    await ctx.run("node", ["scripts/verify-91177-vehicle-profile-slate-leftover-chrome.mjs"]);
  },
};
