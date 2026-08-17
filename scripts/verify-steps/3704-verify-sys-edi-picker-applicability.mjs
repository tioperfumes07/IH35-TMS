export default {
  name: "verify-sys-edi-picker-applicability",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-sys-edi-picker-applicability.mjs"]);
  },
};
