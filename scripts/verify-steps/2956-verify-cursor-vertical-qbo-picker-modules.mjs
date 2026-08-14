export default {
  name: "verify-cursor-vertical-qbo-picker-modules",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cursor-vertical-qbo-picker-modules.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cursor-vertical-qbo-picker-modules.mjs"]);
  },
};
