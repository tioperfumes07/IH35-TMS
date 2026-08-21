// verify-steps wrapper for scripts/verify-lists-recent-activity-catalog-key-action-derived.mjs
// (Lists chrome-law / honest-data audit, live-reproduced 2026-08-21 checking Miss-C dispatch->
// fleet->lists->maintenance order: /lists' "Recent Catalog Activity" card showed "unknown ·
// updated · -" / "pending" for every real row because views.catalogs_recent_activity only read
// payload keys none of the ~20 catalogs/*.routes.ts writers populate; fixed by deriving
// catalog_key/action from the always-consistent `catalogs.<name>.<action>` event_class via
// split_part, migration 202612931300), verify-step 4195, Rule 37 claim-then-author pattern (claim
// shipped in #13571). Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-lists-recent-activity-catalog-key-action-derived",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-recent-activity-catalog-key-action-derived.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-recent-activity-catalog-key-action-derived.mjs"]);
  },
};
