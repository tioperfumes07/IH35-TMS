// LST-PICKER-01 insurance coverage type inline create (claim 1864).
export default {
  name: "verify-lst-picker01-insurance-coverage-type-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-insurance-coverage-type-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-insurance-coverage-type-inline-create.mjs"]);
  },
};
