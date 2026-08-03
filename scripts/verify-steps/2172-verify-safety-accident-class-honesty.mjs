export default {
  name: "verify-safety-accident-class-honesty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-accident-class-honesty.mjs"]);
  },
};
