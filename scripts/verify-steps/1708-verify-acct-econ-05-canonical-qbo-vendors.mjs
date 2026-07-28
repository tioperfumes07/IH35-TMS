export default {
  name: "verify-acct-econ-05-canonical-qbo-vendors",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-econ-05-canonical-qbo-vendors.mjs"]);
  },
};
