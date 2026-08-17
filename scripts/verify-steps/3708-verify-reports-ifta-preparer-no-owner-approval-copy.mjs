export default {
  name: "verify-reports-ifta-preparer-no-owner-approval-copy",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-ifta-preparer-no-owner-approval-copy.mjs"]);
  },
};
