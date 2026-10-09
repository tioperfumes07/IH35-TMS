export default {
  name: "2968-verify-drv-bill-skip-audit-paths",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-drv-bill-skip-audit-paths.mjs"]);
    await ctx.run("node", ["scripts/verify-91176-shared-chrome-slate-leftover-chrome.mjs"]);
  },
};
