// verify-no-hold-language-in-active-blocks — OWNER LAW 2026-08-03 (reaffirmed by the owner in chat
// 2026-08-06: "there is no hold … all questions have been asked and answered … never defer we always fix").
//
// verify-no-approval-holds (step 2218) deliberately EXCLUDES .block-ready/ as history/evidence. That is
// right for COMPLETED blocks, but a block with status BUILD/READY is a LIVE WORK ORDER a coder reads and
// follows — and 15 of them still carried dead law. The worst was
// .block-ready/REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19.json (status BUILD), whose acceptance[] said
// "Flag default OFF per-entity behind financial HOLD/JORGE-APPROVED + Neon proof before enable". That is
// FALSE against prod (br-fancy-credit-akjnd07a, 2026-08-06: REVENUE_RECOGNITION_POST_ENABLED already true
// for TRANSP + USMCA, false for TRK which is correct per the locked entity scope) — a coder building that
// block to its own acceptance criteria would have turned USMCA's posting flags OFF.
//
// Scope is deliberately narrow so history stays WORM: .block-ready/*.json only, ACTIVE statuses only,
// affirmative instructions only. Tombstone sentences that RECORD the abolition are retained.
export default {
  name: "verify:no-hold-language-in-active-blocks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-hold-language-in-active-blocks.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-hold-language-in-active-blocks.mjs"]);
  },
};
