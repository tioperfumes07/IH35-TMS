// LST-PICKER-01 tire brand inline create (claim 1862).
export default {
  name: "verify-lst-picker01-tire-brand-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-tire-brand-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-tire-brand-inline-create.mjs"]);
  },
};
