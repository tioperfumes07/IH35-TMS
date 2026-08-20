export default {
  name: "verify-wo-cancellation-reason-picker-law",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wo-cancellation-reason-picker-law.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wo-cancellation-reason-picker-law.mjs"]);
  },
};
