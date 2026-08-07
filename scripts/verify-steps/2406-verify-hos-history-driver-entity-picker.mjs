export default {
  name: "verify-hos-history-driver-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hos-history-driver-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-hos-history-driver-entity-picker.mjs"]);
  },
};
