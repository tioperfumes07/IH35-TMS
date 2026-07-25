// A backfill into catalogs.items may only insert item_types the table's CHECK accepts. Migration
// 202607950000 originally copied QBO 'Category'/'Group' pseudo-items and would have aborted on prod;
// it passed CI only because the fresh CI seed has no Category rows.
export default {
  name: "verify:items-backfill-type-allowlist",
  run(ctx) {
    ctx.run("node", ["scripts/verify-items-backfill-type-allowlist.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-items-backfill-type-allowlist.mjs"]);
  },
};
