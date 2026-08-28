export default {
  name: "verify-standing-directive-present",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-standing-directive-present.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-standing-directive-present.mjs"]);
    await ctx.run("node", ["scripts/verify-economic-columns-c25-c31-present.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-economic-columns-c25-c31-present.mjs"]);
    await ctx.run("node", ["scripts/verify-module-progress-not-authored.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-bulk-test-void.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-bulk-test-void.mjs"]);
  },
};
