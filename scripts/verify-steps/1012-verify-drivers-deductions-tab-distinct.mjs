// 0441-mod5-deductions-tab-wrong-content — deductions subnav must not share cash-advances Debt Alert.
export default {
  name: "drivers-deductions-tab-distinct",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-drivers-deductions-tab-distinct.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-drivers-deductions-tab-distinct.mjs"]);
    // BANK-F91468 — R319 Driver Profile Fuel tab (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-r319-driver-fuel-tab.mjs", "--selftest"]);
  },
};
