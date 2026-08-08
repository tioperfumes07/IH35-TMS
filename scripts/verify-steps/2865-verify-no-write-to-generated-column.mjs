// verify-no-write-to-generated-column — ACCT-F200.
//
// A write to a GENERATED column is a guaranteed runtime 500 on first execution, every time. The
// invoice void route shipped `SET amount_open_cents = 0` against a STORED GENERATED column and every
// void on prod failed until it was reverted in 6c73e28.
//
// A guard with a near-identical name already existed and did not cover this:
// verify-generated-column-immutability.mjs checks that a MIGRATION's generation EXPRESSION is
// immutable. Nothing checked application SQL writing such a column — which is why a green build
// shipped a P0. This step closes that direction, keyed off the four generated columns verified live
// on the prod branch across the money schemas.
//
// Selftest runs first and includes the outage verbatim, plus the reads that must stay legal: a
// SELECT of a generated column and a WHERE comparison on one are not writes, and flagging them would
// redden every A/R surface in the codebase.
export default {
  name: "verify:no-write-to-generated-column",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-write-to-generated-column.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-write-to-generated-column.mjs"]);
  },
};
