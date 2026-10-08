export default {
  name: "verify-topbar-responsive-no-horizontal-clip",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-topbar-responsive-no-horizontal-clip.mjs"]);
    await ctx.run("node", ["scripts/verify-91060-detail-vendorbill-qbo-slate-leftover-chrome.mjs"]);
  },
};
