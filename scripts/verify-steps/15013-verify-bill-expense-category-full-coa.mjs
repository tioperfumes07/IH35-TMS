export default {
  name: "verify:bill-expense-category-full-coa",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-expense-category-full-coa.mjs"]);
  },
};
