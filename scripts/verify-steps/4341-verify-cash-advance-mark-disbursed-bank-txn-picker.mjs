export default {
  name: "verify:cash-advance-mark-disbursed-bank-txn-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-advance-mark-disbursed-bank-txn-picker.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-advance-mark-disbursed-bank-txn-picker.mjs"]);
    ctx.run("node", ["scripts/verify-ca-mark-disbursed-silent-noop.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ca-mark-disbursed-silent-noop.mjs"]);
  },
};
