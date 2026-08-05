export default {
  name: "verify-entity-picker-load-kind-sweep",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entity-picker-load-kind-sweep.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entity-picker-load-kind-sweep.mjs"]);
  },
};
