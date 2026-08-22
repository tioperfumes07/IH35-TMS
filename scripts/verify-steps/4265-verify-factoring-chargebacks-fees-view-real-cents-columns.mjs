export default {
  name: "verify:factoring-chargebacks-fees-view-real-cents-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-chargebacks-fees-view-real-cents-columns.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-chargebacks-fees-view-real-cents-columns.mjs"]);
  },
};
