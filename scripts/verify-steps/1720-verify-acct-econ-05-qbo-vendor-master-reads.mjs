export default {
  name: "verify:acct-econ-05-qbo-vendor-master-reads",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-econ-05-qbo-vendor-master-reads.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-econ-05-qbo-vendor-master-reads.mjs"]);
  },
};
