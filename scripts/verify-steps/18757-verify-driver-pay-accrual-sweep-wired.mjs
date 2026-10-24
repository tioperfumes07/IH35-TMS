export default {
  name: "verify-driver-pay-accrual-sweep-wired",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pay-accrual-sweep-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-pay-accrual-sweep-wired.mjs"]);
  },
};
