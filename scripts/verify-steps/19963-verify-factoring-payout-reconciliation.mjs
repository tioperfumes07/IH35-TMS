export default {
  name: "verify:verify-factoring-payout-reconciliation",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-payout-reconciliation.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-payout-reconciliation.mjs"]);
  },
};
