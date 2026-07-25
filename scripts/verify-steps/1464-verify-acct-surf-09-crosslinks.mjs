export default {
  name: "verify-acct-surf-09-crosslinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surf-09-crosslinks.mjs"]);
  },
};
