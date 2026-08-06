// verify-join-entity-scoped — CLS-JOIN-ENTITY-UNSCOPED. Scoping the row you READ does not scope the row
// you JOIN TO, or the row you fetch by bare id. RLS is NOT a backstop: the policy admits
// org.user_accessible_company_ids(), which returns EVERY active company when the role is Owner — so on an
// ordinary owner request an unscoped join returns another entity's driver/customer/invoice without error.
// FULL-TREE by design: verify-mdata-entity-scope is changed-SQL only, so a dormant unscoped join is
// invisible until someone edits that literal — which is how both instances were found, by accident.
// Covers JOIN and bare `FROM <entity-table> WHERE id = $N` reads. Baseline ratchet, may only shrink.
// NOTE: sites that DERIVE the opco from a supplied id (resolvers) must be EXEMPTED, not given a circular
// predicate — the control there is a membership assertion on the derived company (see MDATA-F03).
export default {
  name: "verify:join-entity-scoped",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-join-entity-scoped.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-join-entity-scoped.mjs"]);
  },
};
