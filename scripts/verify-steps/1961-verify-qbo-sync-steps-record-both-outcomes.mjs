export default {
  name: "verify-qbo-sync-steps-record-both-outcomes",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-sync-steps-record-both-outcomes.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-sync-steps-record-both-outcomes.mjs"]);
  },
};
