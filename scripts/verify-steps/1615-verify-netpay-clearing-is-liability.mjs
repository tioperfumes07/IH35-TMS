// 1615 — SET-02: driver_payroll_clearing must be a distinct Liability (never Cash Advance / QBO-149).
export default {
  name: "verify-netpay-clearing-is-liability",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-netpay-clearing-is-liability.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-netpay-clearing-is-liability.mjs"]);
  },
};
