export default {
  name: "verify-owner-quality-compact-present",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-owner-quality-compact-present.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-owner-quality-compact-present.mjs"]);
  },
};
