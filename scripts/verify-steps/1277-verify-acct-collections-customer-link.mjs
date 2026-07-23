export default {
  name: "verify-acct-collections-customer-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-collections-customer-link.mjs"]);
  },
};
