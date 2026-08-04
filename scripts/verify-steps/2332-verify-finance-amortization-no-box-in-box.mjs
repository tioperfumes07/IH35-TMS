// GUARD — Finance Amortization box-in-box flatten (verify-step 2332 · Cursor EVEN band).
export default {
  name: "finance-amortization-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-finance-amortization-no-box-in-box.mjs"]);
  },
};
