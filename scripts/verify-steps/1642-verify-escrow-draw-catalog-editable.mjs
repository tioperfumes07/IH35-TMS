export default {
  name: "verify-escrow-draw-catalog-editable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-escrow-draw-catalog-editable.mjs"]);
  },
};
