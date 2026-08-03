export default {
  name: "verify-safety-hos-dashboard-driver-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-hos-dashboard-driver-entitylink.mjs"]);
  },
};
