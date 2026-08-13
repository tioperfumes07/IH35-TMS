/**
 * CLAIMED 3124 — Cursor EVEN — verify-proportion-chrome-modal-drawer-density
 */
export default {
  name: "verify-proportion-chrome-modal-drawer-density",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-proportion-chrome-modal-drawer-density.mjs"]);
  },
};
