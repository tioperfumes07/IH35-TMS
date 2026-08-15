export default {
  name: "verify-accounting-escrow-holder-reverse-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accounting-escrow-holder-reverse-link.mjs"]);
  },
};
