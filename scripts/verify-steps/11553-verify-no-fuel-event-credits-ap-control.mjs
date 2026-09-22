/**
 * verify:guard-wired fix — verify-no-fuel-event-credits-ap-control.mjs (CC-3, R-30.1-A, PR #22176,
 * commit 148628d3b2) landed but was never wired into a claimed verify-step, so it never
 * independently ran in CI (flagged as orphan by `npm run verify:guard-wired` while landing an
 * unrelated PR — same class as the 11533/11537/11541/11545 orphan-wiring gaps this round). Wraps
 * it into the CI verify-step convention (verify-step 11553, CC-1 band, CLAIM-RESERVE #11553).
 *
 * The guard declares REQUIRES_LIVE_DB (ruled 2026-09-23, docs/bus/INBOX-CC-1.md) — excluded from
 * verify-static's no-DB sweep, but still runs for real here with a live DATABASE_URL, fail-closed
 * per ROUND 29.9-B, never a silent skip.
 */
export default {
  name: "verify-no-fuel-event-credits-ap-control",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-fuel-event-credits-ap-control.mjs"]);
  },
};
