/** CC-2 — ACC-20 ("No automatic un-categorize in either direction when a match is reversed").
 * Guards that the session-scoped unmatch route (reconciliation.routes.ts) resets review_state back
 * to 'for_review' when it clears every matched_*_id pointer — before this fix it left the row stuck
 * at 'matched' with nothing actually matched, an orphaned state that would not re-surface in the
 * for-review queue. */
export default {
  name: "verify-recon-session-unmatch-resets-review-state",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-recon-session-unmatch-resets-review-state.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-recon-session-unmatch-resets-review-state.mjs"]);
  },
};
