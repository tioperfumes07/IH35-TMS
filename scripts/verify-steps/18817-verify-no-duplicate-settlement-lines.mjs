// ENG-42 (443.328): shrink-only ceiling on active duplicate settlement-line groups.
// Selftest first, then live DB run (skips if DATABASE_URL unset).
export default {
  name: "verify-no-duplicate-settlement-lines",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-duplicate-settlement-lines.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-duplicate-settlement-lines.mjs"]);
  },
};
