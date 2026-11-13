export default {
  name: "verify:vendor-report-card-payables-is-liability",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-report-card-payables-is-liability.mjs"]);
    ctx.run("node", ["scripts/verify-vendor-report-card-payables-is-liability.mjs", "--selftest"]);
  },
};
