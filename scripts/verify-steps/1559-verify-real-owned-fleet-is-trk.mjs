export default {
  name: "verify-real-owned-fleet-is-trk",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-real-owned-fleet-is-trk.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-real-owned-fleet-is-trk.mjs"]);
  },
};
