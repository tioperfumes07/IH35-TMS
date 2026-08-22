export default {
  name: "verify:chargebacks-fees-advance-amount-column",
  run(ctx) {
    ctx.run("node", ["scripts/verify-chargebacks-fees-advance-amount-column.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-chargebacks-fees-advance-amount-column.mjs"]);
  },
};
