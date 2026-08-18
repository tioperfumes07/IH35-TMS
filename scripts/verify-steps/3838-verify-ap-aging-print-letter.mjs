export default {
  name: "verify-ap-aging-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ap-aging-print-letter.mjs"]);
  },
};
