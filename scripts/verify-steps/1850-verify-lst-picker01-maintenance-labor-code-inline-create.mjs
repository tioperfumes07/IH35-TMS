// LST-PICKER-01 LaborTracker maintenance_labor_code (claim 1850).
export default {
  name: "lst-picker01-maintenance-labor-code-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-maintenance-labor-code-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-maintenance-labor-code-inline-create.mjs"]);
  },
};
