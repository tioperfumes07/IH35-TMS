// CLS-DISPLAYID-UNSCOPED ratchet. display_id is UNIQUE per (operating_company_id, display_id), NOT
// globally — every entity's sequence restarts at 00001, so resolving by display_id alone can hit
// another entity's row. INV-2026-00004 exists on BOTH USMCA (test) and TRANSP (real, paid).
// Zero live offenders when written; this keeps the next one out.
export default {
  name: "verify-displayid-entity-scoped-lookups",
  run(ctx) {
    ctx.run("node", ["scripts/verify-displayid-entity-scoped-lookups.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-displayid-entity-scoped-lookups.mjs"]);
  },
};
