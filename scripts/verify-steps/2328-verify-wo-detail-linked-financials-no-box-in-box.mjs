// GUARD — WorkOrderDetail linked financials box-in-box flatten (verify-step 2328 · Cursor EVEN band).
export default {
  name: "wo-detail-linked-financials-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-wo-detail-linked-financials-no-box-in-box.mjs"]);
  },
};
