export default {
  name: "verify-held-posting-flags-enable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-held-posting-flags-enable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-held-posting-flags-enable.mjs"]);
  },
};
