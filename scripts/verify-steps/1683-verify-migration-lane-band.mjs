/** Migration numbers come from a reserved per-lane band, so two lanes cannot claim the same one. */
export default {
  name: "verify-migration-lane-band",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-migration-lane-band.mjs"]);
    await ctx.run("node", ["scripts/verify-migration-lane-band.mjs", "--selftest"]);
  },
};
