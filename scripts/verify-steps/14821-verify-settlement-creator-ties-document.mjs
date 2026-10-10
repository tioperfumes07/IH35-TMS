export default {
  name: "verify:settlement-creator-ties-document",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-creator-ties-document.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-creator-decimals-f443.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-creator-decimals-f443.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-creator-google-address-wiring.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-creator-google-address-wiring.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-creator-ux-f441.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-creator-ux-f441.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-creator-ux-f442.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-creator-ux-f442.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-creator-no-quickpay-on-factored.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-creator-no-quickpay-on-factored.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-creator-invoice-number-and-zero-invoice.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-creator-invoice-number-and-zero-invoice.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-creator-driver-pay-independent-of-invoice.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-creator-driver-pay-independent-of-invoice.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-creator-every-line-has-load.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-creator-every-line-has-load.mjs"]);
  },
};
