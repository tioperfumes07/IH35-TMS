export default {
  name: "verify-bookload-edit-freight-roundtrip",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bookload-edit-freight-roundtrip.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bookload-edit-freight-roundtrip.mjs"]);
  },
};
