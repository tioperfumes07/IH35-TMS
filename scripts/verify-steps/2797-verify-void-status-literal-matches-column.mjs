// verify-void-status-literal-matches-column — CLS-VOID-LITERAL-DEAD / ACCT-F171.
// A/R aging excluded status 'voided', a value accounting.invoices.status can NEVER hold — the
// CHECK constraint forbids it. So the status half of the void exclusion could not fire and the
// filter rested on voided_at alone; one invoice with status='void' and voided_at NULL slipped
// through, and USMCA reported $4,325.50 of receivables where $1,875.50 was real. Enrolment is
// per (table, column) against the CHECK domain, so the guard cannot redden on correct code — the
// discipline the board's CLS-VOID-PREDICATE-DRIFT ruling requires. Selftest runs first and plants
// the pre-fix predicate in the REAL ar-aging service.
export default {
  name: "verify:void-status-literal-matches-column",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-void-status-literal-matches-column.mjs"]);
  },
};
