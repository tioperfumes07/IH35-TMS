export default {
  name: "verify-assignment-history-driver-picker-law",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-assignment-history-driver-picker-law.mjs"]);
  },
};
