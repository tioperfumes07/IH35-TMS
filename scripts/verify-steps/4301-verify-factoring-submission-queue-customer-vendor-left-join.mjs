export default {
  name: "verify:factoring-submission-queue-customer-vendor-left-join",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-submission-queue-customer-vendor-left-join.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-submission-queue-customer-vendor-left-join.mjs"]);
  },
};
