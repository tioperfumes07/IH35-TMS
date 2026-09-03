/** CC-2 — Book Load wizard money-path + layout restore guard (owner 2026-09-03).
 * Extends the money clamp checks with fabricated-citation ban (no invented "owner ruling"
 * cites without docs/) and layout restore checks (Section A freight fields, no Equipment/load type). */
export default {
  name: "verify-book-load-money-and-controls",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-load-money-and-controls.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-book-load-money-and-controls.mjs"]);
    await ctx.run("node", ["scripts/verify-no-fabricated-owner-ruling-cites.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-fabricated-owner-ruling-cites.mjs"]);
  },
};
