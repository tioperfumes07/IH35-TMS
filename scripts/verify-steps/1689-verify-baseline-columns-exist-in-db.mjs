/** META-GUARD: a column the drift baseline claims must exist in a real migrated database (#3715 class). */
export default {
  name: "verify-baseline-columns-exist-in-db",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-baseline-columns-exist-in-db.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-baseline-columns-exist-in-db.mjs"]);
  },
};
