// GUARD — Finance Loan Wizard box-in-box flatten (verify-step 2334 · Cursor EVEN band).
export default {
  name: "finance-loan-wizard-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-finance-loan-wizard-no-box-in-box.mjs"]);
  },
};
