export default {
  name: "verify-ar-aging-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ar-aging-print-letter.mjs"]);
  },
};
