// CLS-INS-CLAIM-EP — ClaimCreateModal load/trailer EntityPicker (not Combobox silent cap).
export default {
  name: "verify:claim-create-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-claim-create-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-claim-create-entity-picker.mjs"]);
    await ctx.run("node", ["scripts/verify-claim-create-picker-search.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-claim-create-picker-search.mjs"]);
  },
};
