export default {
  name: "verify-assign-driver-dropdown-selected-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-assign-driver-dropdown-selected-entitylink.mjs"]);
  },
};
