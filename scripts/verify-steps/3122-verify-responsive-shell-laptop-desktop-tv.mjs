/**
 * CLAIMED 3122 — Cursor EVEN — verify-responsive-shell-laptop-desktop-tv
 */
export default {
  name: "verify-responsive-shell-laptop-desktop-tv",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-responsive-shell-laptop-desktop-tv.mjs"]);
    // BANK-F91443 — C-06 viewport auto-adjust (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c06-viewport-auto-adjust.mjs", "--selftest"]);
  },
};
