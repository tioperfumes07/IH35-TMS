// LST-PICKER-01 WorkOrderCreateModal category+item inline create (claim 1894).
export default {
  name: "verify-lst-picker01-wo-create-category-item-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-wo-create-category-item-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-wo-create-category-item-inline-create.mjs"]);
  },
};
