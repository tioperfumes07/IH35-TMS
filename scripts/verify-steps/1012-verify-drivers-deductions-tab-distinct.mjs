// 0441-mod5-deductions-tab-wrong-content — deductions subnav must not share cash-advances Debt Alert.
export default {
  name: "drivers-deductions-tab-distinct",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-deductions-tab-distinct.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-drivers-deductions-tab-distinct.mjs"]);
  },
};
