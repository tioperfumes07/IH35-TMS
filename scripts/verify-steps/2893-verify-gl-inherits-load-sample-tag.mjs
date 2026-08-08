// verify-gl-inherits-load-sample-tag — ACCT-F210 (the GL half of FAIL-D6).
//
// FAIL-D6 (#4923) made a load taggable at Book, and two money paths already inherited it — from-load.ts
// writes the invoice tag and settlements-load-bookended.service.ts writes the settlement-line tag. The
// GENERAL LEDGER did not, because createJournalEntry had NO is_sample_data parameter at all, so no
// poster could pass one even if it wanted to.
//
// A sample load therefore produced a tagged invoice, tagged settlement lines, and UNTAGGED revenue
// journal entries. The GL is the surface financial statements are built from, so "exclude sample rows
// from this report" still counted SAMPLE REVENUE AS REAL — the exact outcome D6 exists to prevent. The
// gap was invisible precisely BECAUSE three of the four surfaces looked correct.
//
// The guard asserts BOTH halves — the parameter is accepted AND named in the INSERT, and the latch
// reads it off the load AND passes it — because either alone looks fixed and is not. It also rejects
// deriving the flag by string-matching a memo or load number.
//
// ITS OWN FIRST VERSION WAS FALSE-GREEN: a bare /is_sample_data:/ matched the LoadRow TYPE DECLARATION,
// so deleting the real argument still passed. Mutation-testing caught that, and the check is now scoped
// to inside the createJournalEntry( call. A guard that cannot fail is worthless.
export default {
  name: "verify:gl-inherits-load-sample-tag",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-gl-inherits-load-sample-tag.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-gl-inherits-load-sample-tag.mjs"]);
  },
};
