export default {
  name: "verify:fuel-expense-is-unique-per-provider-transaction",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-expense-is-unique-per-provider-transaction.mjs"]);
  },
};
