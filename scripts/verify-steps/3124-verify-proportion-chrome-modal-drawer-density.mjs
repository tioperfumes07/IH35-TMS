/**
 * CLAIMED 3124 — Cursor EVEN — verify-proportion-chrome-modal-drawer-density
 */
export default {
  name: "verify-proportion-chrome-modal-drawer-density",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-proportion-chrome-modal-drawer-density.mjs"]);
    await ctx.run("node", ["scripts/verify-91162-drvfin-applicants-slate-leftover-chrome.mjs"]);
  },
};
