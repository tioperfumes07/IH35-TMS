// Step 1737 — top-bar grid items must carry min-w-0 or they overflow their column and render on top
// of the next one. Live defect on prod: the entity chip sat underneath the Tasks/Program buttons on
// every page.
export default {
  name: "verify:topbar-grid-items-shrinkable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-topbar-grid-items-shrinkable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-topbar-grid-items-shrinkable.mjs"]);
  },
};
