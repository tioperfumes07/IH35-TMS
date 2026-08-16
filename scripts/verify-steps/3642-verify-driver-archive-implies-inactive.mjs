export default {
  name: "verify-driver-archive-implies-inactive",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-archive-implies-inactive.mjs"]);
  },
};
