export default {
  name: "verify-wo-create-v5-error-surfaced",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wo-create-v5-error-surfaced.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wo-create-v5-error-surfaced.mjs"]);
  },
};
