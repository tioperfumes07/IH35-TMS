export default {
  name: "verify:driver-payment-method-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-payment-method-tenant-scope.mjs"]);
  },
};
