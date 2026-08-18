export default {
  name: "verify-home-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-home-print-letter.mjs"]);
  },
};
