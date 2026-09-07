export default {
  name: "verify-dispatch-subnav-no-factoring",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-subnav-no-factoring.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-subnav-no-factoring.mjs"]);
  },
};
