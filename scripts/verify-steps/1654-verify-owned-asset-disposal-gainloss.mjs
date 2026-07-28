/** FLT-05 — explicit owned-asset disposal requires balanced, flag-gated gain/loss posting. */
export default {
  name: "verify-owned-asset-disposal-gainloss",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-owned-asset-disposal-gainloss.mjs"]);
  },
};
