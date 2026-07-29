// Step 1735 — no named module route may resolve to ComingSoonPage. A placeholder on a real route is a
// dead end indistinguishable from an unbuilt feature.
export default {
  name: "verify:no-placeholder-module-routes",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-placeholder-module-routes.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-placeholder-module-routes.mjs"]);
  },
};
