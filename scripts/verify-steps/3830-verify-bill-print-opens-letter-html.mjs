export default {
  name: "verify-bill-print-opens-letter-html",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-print-opens-letter-html.mjs"]);
  },
};
