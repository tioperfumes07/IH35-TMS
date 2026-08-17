export default {
  name: "verify-driver-hub-report-issue-ownership",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-hub-report-issue-ownership.mjs"]);
  },
};
