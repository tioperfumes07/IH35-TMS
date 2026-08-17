export default {
  name: "verify:bill-payments-vendor-resolves-tms-native",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-payments-vendor-resolves-tms-native.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bill-payments-vendor-resolves-tms-native.mjs"]);
  },
};
