export default {
  name: "verify-entity-picker-trailer-kind-sweep",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entity-picker-trailer-kind-sweep.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entity-picker-trailer-kind-sweep.mjs"]);
  },
};
