export default {
  name: "verify-print-opens-canonical-document",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-print-opens-canonical-document.mjs"]);
  },
};
