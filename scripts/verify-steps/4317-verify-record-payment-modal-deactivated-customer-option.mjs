export default {
  name: "verify:record-payment-modal-deactivated-customer-option",
  run(ctx) {
    ctx.run("node", ["scripts/verify-record-payment-modal-deactivated-customer-option.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-record-payment-modal-deactivated-customer-option.mjs"]);
  },
};
