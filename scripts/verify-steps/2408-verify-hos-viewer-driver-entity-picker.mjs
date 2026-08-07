export default {
  name: "verify-hos-viewer-driver-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hos-viewer-driver-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-hos-viewer-driver-entity-picker.mjs"]);
  },
};
