export default {
  name: "verify:overpayment-becomes-unapplied-credit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-overpayment-becomes-unapplied-credit.mjs"]);
    ctx.run("node", ["scripts/verify-overpayment-becomes-unapplied-credit.mjs", "--selftest"]);
  },
};
