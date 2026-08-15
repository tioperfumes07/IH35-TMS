export default {
  name: "verify-pdf-render-date-object-stringify",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pdf-render-date-object-stringify.mjs"]);
  },
};
