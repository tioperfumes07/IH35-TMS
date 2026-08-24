export default {
  name: "verify-wo-bill-lines-expense-category-resolved",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-wo-bill-lines-expense-category-resolved.mjs"]) !== 0) {
      throw new Error("verify-wo-bill-lines-expense-category-resolved failed");
    }
  },
};
