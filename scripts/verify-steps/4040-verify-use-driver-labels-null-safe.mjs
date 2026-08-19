export default {
  name: "verify-use-driver-labels-null-safe",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-use-driver-labels-null-safe.mjs"]);
  },
};
