export default {
  name: "verify:expense-category-picker-canonical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-category-picker-canonical.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-expense-category-picker-canonical.mjs"]);
  },
};
