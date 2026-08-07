// CLS-DISP-TRAILER-EP — dispatch trailer pickers use EntityPicker kind=trailer (mdata.equipment).
export default {
  name: "verify:dispatch-trailer-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-trailer-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-trailer-entity-picker.mjs"]);
  },
};
