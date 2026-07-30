// Step 1769 — top-bar grid tracks must be minmax(0,…) and stack before they overlap.
export default {
  name: "verify:topbar-tracks-shrinkable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-topbar-tracks-shrinkable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-topbar-tracks-shrinkable.mjs"]);
  },
};
