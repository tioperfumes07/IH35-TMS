export default {
  name: "verify:vendor-payment-methods-delete-revoked-from-public",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-payment-methods-delete-revoked-from-public.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-payment-methods-delete-revoked-from-public.mjs"]);
  },
};
