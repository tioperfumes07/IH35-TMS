export default {
  name: "verify:expense-category-fk-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-category-fk-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expense-category-fk-wired.mjs"]);
  },
};
