export default {
  name: "verify-dual-path-audit-present",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dual-path-audit-present.mjs"]);
  },
};
