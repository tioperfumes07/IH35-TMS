export default {
  name: "verify-bank-econ-04-honesty-keep",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-econ-04-honesty-keep.mjs"]);
  },
};
