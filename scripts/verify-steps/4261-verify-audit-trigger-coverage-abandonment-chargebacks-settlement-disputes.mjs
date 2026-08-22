export default {
  name: "verify:audit-trigger-coverage-abandonment-chargebacks-settlement-disputes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-trigger-coverage-abandonment-chargebacks-settlement-disputes.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-trigger-coverage-abandonment-chargebacks-settlement-disputes.mjs"]);
  },
};
