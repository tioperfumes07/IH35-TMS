export default {
  name: "verify:acct-econ-05-canonical-qbo-vendors-map",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-econ-05-canonical-qbo-vendors-map.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-econ-05-canonical-qbo-vendors-map.mjs"]);
  },
};
