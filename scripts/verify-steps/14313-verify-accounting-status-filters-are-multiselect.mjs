export default {
  name: "verify:accounting-status-filters-are-multiselect",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-status-filters-are-multiselect.mjs"]);
  },
};
