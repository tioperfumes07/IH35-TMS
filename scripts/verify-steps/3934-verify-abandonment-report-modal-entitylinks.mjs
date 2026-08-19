export default {
  name: "verify-abandonment-report-modal-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-abandonment-report-modal-entitylinks.mjs"]);
  },
};
