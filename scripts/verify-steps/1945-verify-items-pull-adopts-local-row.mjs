export default {
  name: "verify-items-pull-adopts-local-row",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-items-pull-adopts-local-row.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-items-pull-adopts-local-row.mjs"]);
  },
};
