export default {
  name: "verify:customer-payment-posts-with-zero-applications",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-payment-posts-with-zero-applications.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-payment-posts-with-zero-applications.mjs"]);
  },
};
