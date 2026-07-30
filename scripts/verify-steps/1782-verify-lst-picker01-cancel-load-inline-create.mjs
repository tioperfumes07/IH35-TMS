export default {
  name: "verify-lst-picker01-cancel-load-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-cancel-load-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-cancel-load-inline-create.mjs"]);
  },
};
