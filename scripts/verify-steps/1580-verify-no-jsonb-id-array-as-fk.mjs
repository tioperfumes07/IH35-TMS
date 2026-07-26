// 1580-verify-no-jsonb-id-array-as-fk — SAF-DOM-02 / class sweep C13.
//
// A jsonb column holding an array of entity ids is a MEMO, not a link: no foreign key, no cascade,
// no reverse read, and nothing stops it pointing at a row that no longer exists. QuickBooks,
// NetSuite, McLeod and Alvys all model a many-to-many as a junction row carrying two real FKs,
// because the value of a relational database is that it REFUSES invalid states.
//
// The guard proves, statically, that every jsonb entity-id column in db/migrations is one of:
//   ARCHIVED  — successor table that really exists in the prod schema mirror + a deprecating
//               COMMENT naming it + DB-ENFORCED stop-write (BEFORE UPDATE OF <col> trigger). A
//               COMMENT ALONE IS NOT ARCHIVED — that exact half-state is what produced SAF-DOM-02,
//               where PATCH kept writing a column the read path had abandoned (silent no-op) and a
//               SECURITY DEFINER trigger kept reading one the create path had stopped filling
//               (a monetary_fine resolution that silently issues no fine).
//   METADATA  — allowlisted genuine non-referential jsonb, with a substantive reason.
//   OPEN      — a tracked instance carrying the id of the block that owns the fix. A RATCHET.
// Plus a second arm: once a column is ARCHIVED, no application source may still name it except
// through a ratcheted, block-owned exception — the arm that would have caught SAF-B28 on day one.
//
// Run against pre-fix origin/main this FAILS with 6 problems: the three
// safety.company_violations jsonb columns are COMMENT-archived but have no stop-write enforcement,
// and the SAF-B28 code exception is stale because nothing is archived yet.
//
// The --selftest runs FIRST and is proven CAPABLE OF FAILING: it plants 12 defects (a removed
// stop-write trigger, a comment-only "archive", a successor table that does not exist, tomorrow's
// brand-new jsonb id array, a grown ratchet, a stale open entry, a blockless entry, a reasonless
// entry, an already-archived column parked on the open list, a brand-new writer to an archived
// column, a stale code exception, a reasonless metadata entry) and asserts every one is caught and
// that no mutation was inert — plus three classifier controls proving the correct shapes are NOT
// flagged: a payload jsonb, a plpgsql DECLARE variable, and a real uuid FK column.
export default {
  name: "verify-no-jsonb-id-array-as-fk",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-jsonb-id-array-as-fk.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-jsonb-id-array-as-fk.mjs"]);
  },
};
