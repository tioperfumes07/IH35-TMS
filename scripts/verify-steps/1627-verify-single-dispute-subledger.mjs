export default {
  name: "verify-single-dispute-subledger",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-single-dispute-subledger.mjs"]);
  },
};
