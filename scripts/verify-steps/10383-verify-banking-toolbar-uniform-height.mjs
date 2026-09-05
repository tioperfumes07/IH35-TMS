export default {
  name: "verify-banking-toolbar-uniform-height",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-toolbar-uniform-height.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-toolbar-uniform-height.mjs"]);
  },
};
