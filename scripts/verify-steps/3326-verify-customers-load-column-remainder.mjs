export default {
  name: "verify-customers-load-column-remainder",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customers-load-column-remainder.mjs"]);
  },
};
