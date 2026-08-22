export default {
  name: "verify:bill-payment-modal-bank-account-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-payment-modal-bank-account-picker.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bill-payment-modal-bank-account-picker.mjs"]);
  },
};
