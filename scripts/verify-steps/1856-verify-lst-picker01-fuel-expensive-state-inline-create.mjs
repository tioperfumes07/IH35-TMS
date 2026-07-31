// LST-PICKER-01 ExpensiveStatesMultiselect fuel_expensive_state (claim 1856).
export default {
  name: "verify-lst-picker01-fuel-expensive-state-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-fuel-expensive-state-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-fuel-expensive-state-inline-create.mjs"]);
  },
};
