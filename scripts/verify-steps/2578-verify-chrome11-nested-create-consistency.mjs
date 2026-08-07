export default {
  name: "verify:chrome11-nested-create-consistency",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-chrome11-nested-create-consistency.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-chrome11-nested-create-consistency.mjs"]);
  },
};
