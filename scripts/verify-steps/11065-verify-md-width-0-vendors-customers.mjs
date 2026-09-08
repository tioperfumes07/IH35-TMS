export default {
  name: "verify-md-width-0-vendors-customers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-md-width-0-vendors-customers.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-md-width-0-vendors-customers.mjs"]);
  },
};
