export default {
  name: "verify-acct-posting-templates-subnav",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-posting-templates-subnav.mjs"]);
  },
};
