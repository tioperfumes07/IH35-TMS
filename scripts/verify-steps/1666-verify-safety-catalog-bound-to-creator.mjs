/** SAF-B14 — a safety catalog reachable only from its own list page is decoration; a creator must consume it. */
export default {
  name: "verify-safety-catalog-bound-to-creator",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-catalog-bound-to-creator.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-catalog-bound-to-creator.mjs", "--selftest"]);
  },
};
