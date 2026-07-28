export default {
  name: "verify:acct-econ-05-canonical-qbo-vendor-inbound-writes",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-econ-05-canonical-qbo-vendors.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-econ-05-canonical-qbo-vendors.mjs"]);
  },
};
