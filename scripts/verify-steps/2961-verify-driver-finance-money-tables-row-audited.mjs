// WORM-ROW-AUDIT-GAP-IS-23-TABLES — verify-step 2961.
//
// Enumerates its OWN denominator (every driver_finance base table, live from pg_class) rather than a
// hand-written list, so a newly added table cannot silently join the gap this migration closed.
// 4 tables are deliberately excluded, with the reason stated in the migration
// (202612500000_driver_finance_row_audit_gap_attach.sql) and repeated here so a future edit to this
// exclusion list has to read why, not just delete a name:
//   cash_advance_owner_approval_audit, cash_advance_request_audit — these ARE audit sinks; auditing an
//     audit table is circular and doubles write volume on every approval.
//   trip_link_queue — a transient work queue; rows are consumed, not kept.
//   settlement_preview_costs — an ephemeral preview recomputed on demand; it is not the settlement.
//
// DB-backed (needs DATABASE_URL) — SKIPs cleanly with no DB, same posture as every other live guard in
// this suite, so it never fakes green in a no-DB context and never fails a fresh-DB job that hasn't
// applied 202612500000 yet is a real FAIL once the migration IS present, by design.
export default {
  name: "verify-driver-finance-money-tables-row-audited",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-finance-money-tables-row-audited.mjs"]);
  },
};
