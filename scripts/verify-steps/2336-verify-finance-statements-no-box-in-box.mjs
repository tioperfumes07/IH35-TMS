// GUARD — Finance Financial Statements box-in-box flatten (verify-step 2336 · Cursor EVEN band).
export default {
  name: "finance-statements-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-finance-statements-no-box-in-box.mjs"]);
  },
};
