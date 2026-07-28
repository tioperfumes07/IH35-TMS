// 1716-verify-bank-f10-fuel-overage-recovery-wired — BANK-F10 manifest keep-guard.
//
// Fuel-card overage had FUEL-03 evaluate/approve services but no HTTP surface for operators to
// list pending events or approve-then-recover. Pins route mount + manifest honesty (FAIL until Neon).
export default {
  name: "verify-bank-f10-fuel-overage-recovery-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-f10-fuel-overage-recovery-wired.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-f10-fuel-overage-recovery-wired.mjs"]);
  },
};
