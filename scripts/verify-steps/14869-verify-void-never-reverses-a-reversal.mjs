// ACCT-F397. Wired because the source-linked branch of readOriginalGlPostings was hardened on
// 2026-09-23 after a confirmed live misstatement and the journal_entry branch was left
// unguarded — 61 entries / 122 lines / $5,955.26 of double reversal, invisible to the trial
// balance because a double reversal is balanced.
export default {
  name: "verify:void-never-reverses-a-reversal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-never-reverses-a-reversal.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-void-never-reverses-a-reversal.mjs"]);
  },
};
