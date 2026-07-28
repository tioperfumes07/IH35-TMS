export default {
  name: "verify-account-merge-records-failclosed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-account-merge-records-failclosed.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-account-merge-records-failclosed.mjs"]);
  },
};
