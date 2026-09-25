/**
 * R-177 (Lead, 2026-09-25) — the settlement feeder dates fuel and expenses by the document line date.
 * Verify-step 11604, claude band.
 */
export default {
  name: "verify-feed-uses-document-line-dates",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-feed-uses-document-line-dates.mjs"]);
  },
};
