/** CC-2 — BANK-F9998 F8. Structural "balanced-JE proof (Tier-1)" for the variance-match posting
 * path: the two journal_entry_postings legs postDifferenceJournalEntry writes always share one
 * magnitude on mutually-exclusive opposite sides, so the JE is provably balanced for any variance
 * amount, not just tested amounts. Does not enable MatchDrawer's Confirm for variance matches —
 * that stays a separate, owner-reserved Tier-1 decision. */
export default {
  name: "verify-bank-recon-variance-je-always-balanced",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-recon-variance-je-always-balanced.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-recon-variance-je-always-balanced.mjs"]);
  },
};
