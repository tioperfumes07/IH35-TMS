export default {
  name: "verify-subnav-standard",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-subnav-standard.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-subnav-standard.mjs"]);
  },
};
