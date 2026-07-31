// LST-PICKER-01 FineCreateModal driver EntityPicker (claim 1896).
export default {
  name: "verify-lst-picker01-fine-create-driver-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-fine-create-driver-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-fine-create-driver-entity-picker.mjs"]);
  },
};
