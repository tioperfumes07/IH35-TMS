/** CC-2 — VOID-COLUMN-CONVENTION-LAW-2026-09-03 (owner ruling, LAW.json
 * LAW-2026-09-03-VOID-COLUMN-CONVENTION). deleted_at is retired: never added to a new table.
 * voided_at (money reversed, WORM), deactivated_at (still real, not selectable), revoked_at
 * (access withdrawn) are the only three void-marker conventions from here forward. Ratchet: the
 * count of migration files defining a deleted_at column may only ever stay flat or go down. */
export default {
  name: "verify-no-new-deleted-at-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-new-deleted-at-columns.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-new-deleted-at-columns.mjs"]);
  },
};
