export default {
  name: "verify:expense-category-map-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-category-map-tenant-scope.mjs"]);
  },
};
