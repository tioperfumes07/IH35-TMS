// verify-void-live-posting-db-constraint — DEFECT 282.1 (2026-09-30).
//
// Migration 202614610000 added a DEFERRABLE constraint trigger per voidable table (expenses,
// invoices, bills, payments, factoring_advances, fuel_transactions) so a raw UPDATE that sets
// voided_at while a live journal_entry_postings row still references it FAILS at the database,
// never just at the application layer. This guard asserts the trigger stays present, enabled, and
// correctly configured on every one of those tables.
export default {
  name: "verify:void-live-posting-db-constraint",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-void-live-posting-db-constraint.mjs"]);
  },
};
