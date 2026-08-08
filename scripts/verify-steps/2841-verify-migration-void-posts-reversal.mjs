// verify-migration-void-posts-reversal — CI-F31.
//
// PERMANENT LAW §4: VOID = reversal; nothing is deletable. The application enforces it (voidBill
// posts an equal-and-opposite reversing JE in the same transaction, and VOID_ENFORCEMENT_ENABLED is
// ON for all three entities on prod). A MIGRATION bypasses all of it: direct SQL sets voided_at, no
// service runs, no reversal posts, and nothing fails. Measured live — $1,643.21 of A/P and expense
// and $314.90 of revenue and A/R are on the books today because of exactly that.
//
// Selftest first, and it carries the check that matters most: it empties the baseline and asserts
// the two REAL offenders are still detected. A baseline nobody can prove still fires is just a
// mute button — which is how the four vacuous checks found on 2026-08-08 survived.
export default {
  name: "verify:migration-void-posts-reversal",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-migration-void-posts-reversal.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-migration-void-posts-reversal.mjs"]);
  },
};
