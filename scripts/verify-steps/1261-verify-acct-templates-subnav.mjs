export default {
  name: "verify-acct-templates-subnav",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-templates-subnav.mjs"]);
  },
};
