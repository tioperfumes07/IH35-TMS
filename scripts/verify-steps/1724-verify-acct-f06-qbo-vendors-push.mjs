export default {
  name: "verify:acct-f06-qbo-vendors-push",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-f06-qbo-vendors-push.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-f06-qbo-vendors-push.mjs"]);
  },
};
