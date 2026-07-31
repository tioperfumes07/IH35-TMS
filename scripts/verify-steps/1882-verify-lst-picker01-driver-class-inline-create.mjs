// LST-PICKER-01 DriverDetail class inline create (claim 1882).
export default {
  name: "verify-lst-picker01-driver-class-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-driver-class-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-driver-class-inline-create.mjs"]);
  },
};
