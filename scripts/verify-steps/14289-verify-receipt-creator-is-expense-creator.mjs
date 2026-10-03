export default {
  name: "verify:receipt-creator-is-expense-creator",
  run(ctx) {
    ctx.run("node", ["scripts/verify-receipt-creator-is-expense-creator.mjs"]);
  },
};
