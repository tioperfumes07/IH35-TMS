// verify-void-reversal-inherits-sample-tag — ACCT-F211.
//
// void.service.ts writes its reversing journal entry with a DIRECT INSERT — it does not go through
// createJournalEntry — and named only seven columns, none of them is_sample_data. So voiding a SAMPLE
// entry produced a REAL reversal.
//
// That is worse than a cosmetic mislabel. The two halves then disagree: the original is excluded from a
// real-money report while its reversal is included, so the reversal appears as a standalone real entry
// with no matching original — unexplained money in the GL, created by the act of cleaning up test data.
// A void is supposed to make the books whole; this made them contradict themselves.
//
// The guard asserts BOTH halves — the column is named AND the value is derived from
// accounting.journal_entries — because binding it to a literal `false` would satisfy a naive column
// check while reproducing the defect exactly. It also rejects memo string-matching, and FAILS CLOSED if
// the reversal writer moves.
export default {
  name: "verify:void-reversal-inherits-sample-tag",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-void-reversal-inherits-sample-tag.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-void-reversal-inherits-sample-tag.mjs"]);
  },
};
