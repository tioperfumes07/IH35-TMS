export default {
  name: "verify-lists-accounting-picker-law-honest",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-accounting-picker-law-honest.mjs"]);
  },
};
