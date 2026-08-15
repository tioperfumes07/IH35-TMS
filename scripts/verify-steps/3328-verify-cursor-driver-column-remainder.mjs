export default {
  name: "verify-cursor-driver-column-remainder",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cursor-driver-column-remainder.mjs"]);
  },
};
