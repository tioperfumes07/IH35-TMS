// verify-display-id-lookups-entity-scoped — CLS-DISPLAYID-UNSCOPED. display_id is unique PER ENTITY,
// not globally: INV-2026-00004 exists twice on prod — a $0 USMCA test artifact and a PAID $3,800 TRANSP
// LONGSHIP invoice. A `WHERE display_id = $1` with no company predicate does not error; it silently
// returns another entity's row. Voiding by display_id would have hit the real paid invoice (the void was
// done by UUID, so it did not). Baseline ratchet: known offenders allowlisted, NEW ones fail, may only shrink.
export default {
  name: "verify:display-id-lookups-entity-scoped",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-display-id-lookups-entity-scoped.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-display-id-lookups-entity-scoped.mjs"]);
  },
};
