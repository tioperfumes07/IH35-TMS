export default {
  name: "verify:expense-category-map-soft-delete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-category-map-soft-delete.mjs"]);
  },
};
