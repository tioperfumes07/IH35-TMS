// CLS-DISP-DRIVER-EP — InlineDriverPicker uses EntityPicker kind=driver (mdata.drivers, server search).
export default {
  name: "verify:inline-driver-picker-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inline-driver-picker-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-inline-driver-picker-entity-picker.mjs"]);
  },
};
