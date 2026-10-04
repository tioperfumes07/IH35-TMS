export default {
  name: "verify:invoice-create-modal-from-load-single-pager",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-create-modal-from-load-single-pager.mjs"]);
  },
};
