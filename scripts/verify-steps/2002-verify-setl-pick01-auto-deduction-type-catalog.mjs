// SETL-PICK-01 — AutoDeductionPolicies deduction type picker reads catalogs.driver_deduction_types (step 2002).
export default {
  name: "verify:setl-pick01-auto-deduction-type-catalog",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-setl-pick01-auto-deduction-type-catalog.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-setl-pick01-auto-deduction-type-catalog.mjs"]);
  },
};
