// GUARD — Expense Payment method required marker (verify-step 2026).
export default {
  name: "expense-payment-method-required-star",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-expense-payment-method-required-star.mjs"]);
  },
};
