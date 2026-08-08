// verify-load-status-money-effects-wired — ACCT-F166 / CLS-GUARD-PINS-CALLSITE.
// The office Kanban wrote a load status and ran NONE of the money side-effects — no revenue latch, no
// settlement ping — so a load could reach a delivery status from the board and leave the ledger
// untouched. The fix is one shared service (applyLoadStatusMoneyEffects) that applies BOTH primitives,
// so the office and dispatch endpoints cannot drift apart. This guard holds every load-status write
// path to calling it, and holds the shared service itself to calling BOTH primitives — the assertion
// is on the behaviour, not on a call site, which is what let the three older guards go red on a
// correct extraction. Selftest first.
export default {
  name: "verify:load-status-money-effects-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-status-money-effects-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-status-money-effects-wired.mjs"]);
  },
};
