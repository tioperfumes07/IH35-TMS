// GUARD — WorkOrderDetail Posting Preview box-in-box flatten (verify-step 2326 · Cursor EVEN band).
export default {
  name: "wo-detail-posting-preview-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-wo-detail-posting-preview-no-box-in-box.mjs"]);
  },
};
