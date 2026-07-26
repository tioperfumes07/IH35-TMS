// 1611-verify-comp01-drug-alcohol-unified-source — COMP-01 (P0, DOT/FMCSA exposure).
//
// A driver PROHIBITED under 49 CFR Part 382 could be dispatched. THREE tables hold D&A results and all
// three have a registered live write path (all three verified present, RLS-FORCED and granted on the
// Neon PROD branch br-fancy-credit-akjnd07a on 2026-07-26):
//   safety.drug_test (0270) · safety.da_test_records (0327) · compliance.drug_alcohol_test_results (0380)
// The shared dispatch qualification gate read the first two. The third — written by
// POST /api/v1/compliance/drug-alcohol/results, which even auto-opens a return-to-duty process, so the
// system positively KNEW the driver was prohibited — was read by nobody in dispatch. Two more surfaces
// answered the same question from still narrower data: the dispatch driver-eligibility endpoint (latest
// safety.drug_test row + Clearinghouse) and the safety drug-status tile (latest safety.drug_test row,
// nothing else).
//
// The fix is unification, not a fourth check: driver-qualification.service.ts now owns ONE evaluator
// over all three sources plus the FMCSA Clearinghouse, the gate enforces with it, and both status
// surfaces display from it.
//
// COMP-01-B, found by EXECUTING the gate's query against prod rather than reading it: on prod
// safety.da_test_records.operating_company_id is TEXT (pg_attribute), alone among the safety tables.
// The gate scoped it `= $2::uuid`; Postgres has no text = uuid operator, so that arm raised 42883 at
// PLAN TIME on every driver, and because the gate is fail-loud the throw aborted the caller's
// transaction — the whole D&A + Clearinghouse check never returned a verdict. Same cast bug in the
// safety-officer home KPI. Both cast to ::text now, both pinned by assertion 4b, both proven to
// execute against prod this session.
//
// Run against pre-fix origin/main (878ce913c) the guard FAILS with 12 problems. The --selftest runs
// FIRST and plants 18 defects against the real repo sources — the COMP-01 defect itself (the third
// table dropped from the union), each other table dropped, the compliance table present as a violation
// source but missing from clearances (which would make a completed return-to-duty un-clearable), the
// RTD arm keyed on test_type instead of the PROD-real test_reason, driver_uuid copy-pasted onto a table
// that has driver_id, an unscoped cross-entity arm, dilute treated as a violation, the evaluator
// un-exported, either surface dropping its delegation, the safety tile regressing to the latest
// drug-test row, the source label dropped from the block or the payload, and the CTE restructured away
// — then proves the live sources are clean.
export default {
  name: "verify-comp01-drug-alcohol-unified-source",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-comp01-drug-alcohol-unified-source.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-comp01-drug-alcohol-unified-source.mjs"]);
  },
};
