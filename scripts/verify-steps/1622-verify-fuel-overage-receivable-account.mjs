// 1622 — FUEL-04: Driver Fuel-Overage Receivable account exists + bound (never Cash Advance).
export default {
  name: "verify-fuel-overage-receivable-account",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-overage-receivable-account.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fuel-overage-receivable-account.mjs"]);
  },
};
