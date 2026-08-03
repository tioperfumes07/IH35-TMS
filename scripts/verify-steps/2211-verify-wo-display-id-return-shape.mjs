export default {
  name: "verify-wo-display-id-return-shape",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wo-display-id-return-shape.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wo-display-id-return-shape.mjs"]);
  },
};
