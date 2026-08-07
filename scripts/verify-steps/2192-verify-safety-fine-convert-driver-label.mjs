export default {
  name: "verify-safety-fine-convert-driver-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-fine-convert-driver-label.mjs"]);
  },
};
