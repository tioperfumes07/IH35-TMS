// verify-steps wrapper for scripts/verify-audit-history-entity-type-resource-type-parity.mjs —
// VEND-F-AUDIT-HISTORY-TAB-ALWAYS-EMPTY: audit-events-list.routes.ts's entity_type/entity_id
// filters must OR-match resource_type/resource_id, and every live EntityAuditHistoryTab
// entityType value must be mapped. Static, no DB.
export default {
  name: "verify-audit-history-entity-type-resource-type-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-history-entity-type-resource-type-parity.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-history-entity-type-resource-type-parity.mjs"]);
  },
};
