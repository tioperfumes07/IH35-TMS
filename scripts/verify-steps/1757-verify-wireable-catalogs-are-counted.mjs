// Step 1757 — every wireable catalog must appear in the Lists count spec, or its rows are silently
// excluded from its domain badge. 28 were missing, hiding 249 live rows on prod.
export default {
  name: "verify:wireable-catalogs-are-counted",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wireable-catalogs-are-counted.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wireable-catalogs-are-counted.mjs"]);
  },
};
