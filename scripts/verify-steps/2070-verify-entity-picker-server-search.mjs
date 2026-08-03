/** SAF-B29 — shared EntityPicker server-side type-ahead for capped kinds. */
export default {
  name: "verify-entity-picker-server-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entity-picker-server-search.mjs"]);
    await ctx.run("node", ["scripts/verify-entity-picker-server-search.mjs", "--selftest"]);
  },
};
