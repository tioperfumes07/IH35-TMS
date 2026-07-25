export default {
  name: "verify-0033-audit-schema-manifest-tool",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-0033-audit-schema-manifest-tool.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-0033-audit-schema-manifest-tool.mjs"]);
  },
};
