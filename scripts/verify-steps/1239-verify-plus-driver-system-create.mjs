export default {
  name: "verify-plus-driver-system-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-plus-driver-system-create.mjs"]);
  },
};
