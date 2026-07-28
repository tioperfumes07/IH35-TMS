/** SAF-B24 — a guard that pins filenames cannot see the fourth copy; this one discovers every safety drawer. */
export default {
  name: "verify-no-bespoke-safety-drawer",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-bespoke-safety-drawer.mjs"]);
    await ctx.run("node", ["scripts/verify-no-bespoke-safety-drawer.mjs", "--selftest"]);
  },
};
