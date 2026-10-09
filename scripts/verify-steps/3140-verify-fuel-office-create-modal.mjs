/** Cursor EVEN · claim 3140 on main before this file (#6329). */
export default {
  name: "verify-fuel-office-create-modal",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-office-create-modal.mjs"]);
    await ctx.run("node", ["scripts/verify-fuel-office-create-modal.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entity-picker-vendor-inline-create.mjs"]);
    // BANK-F91158 piggy — DisputeList/Resolve/VoidOverage slate leftover refuse
    await ctx.run("node", ["scripts/verify-91158-dispute-void-overage-slate-leftover-chrome.mjs"]);
  },
};
