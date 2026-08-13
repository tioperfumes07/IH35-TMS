/**
 * CLAIMED 3122 — Cursor EVEN — verify-responsive-shell-laptop-desktop-tv
 */
export default {
  name: "verify-responsive-shell-laptop-desktop-tv",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-responsive-shell-laptop-desktop-tv.mjs"]);
  },
};
