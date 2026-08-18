export default {
  name: "verify-banking-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-print-letter.mjs"]);
  },
};
