export default {
  name: "verify-dispatch-assign-driver-honest-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-assign-driver-honest-label.mjs"]);
  },
};
