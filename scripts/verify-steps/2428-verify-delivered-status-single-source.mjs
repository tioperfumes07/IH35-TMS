export default {
  name: "verify-delivered-status-single-source",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-delivered-status-single-source.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-delivered-status-single-source.mjs"]);
  },
};
