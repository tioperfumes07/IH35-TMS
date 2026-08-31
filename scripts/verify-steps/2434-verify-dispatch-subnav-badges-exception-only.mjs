export default {
  name: "verify-dispatch-subnav-badges-exception-only",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-subnav-badges-exception-only.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-subnav-badges-exception-only.mjs"]);
  },
};
