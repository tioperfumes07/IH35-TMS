export default {
  name: "verify-acct-link06-rules-call-poster",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-link06-rules-call-poster.mjs"]);
  },
};
