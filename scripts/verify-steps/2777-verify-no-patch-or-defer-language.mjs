/**
 * verify-no-patch-or-defer-language — ADOPTED by CC-1 from CC-3 (ACCT-F158).
 *
 * CC-3 authored this guard and could not wire it: CLAIMED-NUMBERS.json's _band map partitions EVERY
 * integer among cursor (even), cc-1 (n%4===1) and cc-2 (n%4===3), leaving CC-3 no residue class at
 * all. With no claimable number the guard was parked in .guard-exempt.json — on disk, registered,
 * and enforcing nothing behind a green tick. CC-3 refused to squat another lane's band, which was
 * the right call; adopting it into CC-1's band is what actually makes it RUN.
 *
 * 2777 % 4 === 1, so this number is CC-1's to claim.
 */
export default {
  name: "verify-no-patch-or-defer-language",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-patch-or-defer-language.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-patch-or-defer-language.mjs"]);
  },
};
