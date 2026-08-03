export default {
  name: "verify-safety-accident-damage-label-honesty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-accident-damage-label-honesty.mjs"]);
  },
};
