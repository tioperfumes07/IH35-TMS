export default {
  name: "verify:no-opco-filter-on-tables-without-it",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-opco-filter-on-tables-without-it.mjs"]);
  },
};
