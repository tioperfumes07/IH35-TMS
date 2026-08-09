export default {
  name: "verify:load-detail-driver-pay-bills",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-detail-driver-pay-bills.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-detail-driver-pay-bills.mjs"]);
  },
};
