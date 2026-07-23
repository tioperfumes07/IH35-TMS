export default {
  name: "verify-acct-month-close-ack-review",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-month-close-ack-review.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-month-close-ack-review.mjs"]);
  },
};
