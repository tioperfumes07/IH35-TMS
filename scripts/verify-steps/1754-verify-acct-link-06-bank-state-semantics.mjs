export default {
  name: "verify-acct-link-06-bank-state-semantics",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-link-06-bank-state-semantics.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-link-06-bank-state-semantics.mjs"]);
  },
};
