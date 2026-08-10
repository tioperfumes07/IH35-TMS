export default {
  name: "verify-referenceselect-id-binding",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-referenceselect-id-binding.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-referenceselect-id-binding.mjs"]);
  },
};
