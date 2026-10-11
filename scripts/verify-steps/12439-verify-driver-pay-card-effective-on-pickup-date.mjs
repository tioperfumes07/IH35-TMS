export default {
  name: "verify:driver-pay-card-effective-on-pickup-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pay-card-effective-on-pickup-date.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-pay-card-effective-on-pickup-date.mjs"]);
  },
};
