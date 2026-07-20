// 0441-mod10-cashflow-driverpay-hardcoded-empty — driver_pay predictions must be constructed.
export default {
  name: "cash-flow-driver-pay-populated",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-driver-pay-populated.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-driver-pay-populated.mjs"]);
  },
};
