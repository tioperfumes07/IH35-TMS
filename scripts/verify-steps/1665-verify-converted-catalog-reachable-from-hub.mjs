/** LST-A-01 — a converted catalog must be backend-registered AND reachable from the Lists hub. */
export default {
  name: "verify-converted-catalog-reachable-from-hub",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-converted-catalog-reachable-from-hub.mjs"]);
    await ctx.run("node", ["scripts/verify-converted-catalog-reachable-from-hub.mjs", "--selftest"]);
  },
};
