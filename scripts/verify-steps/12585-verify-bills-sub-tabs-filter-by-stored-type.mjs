export default {
  name: "verify:bills-sub-tabs-filter-by-stored-type",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bills-sub-tabs-filter-by-stored-type.mjs"]);
  },
};
