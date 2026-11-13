export default {
  name: "verify:overpayment-becomes-unapplied-credit",
  run(ctx) {
    ctx.run("node", ["--env-file=/Users/jorgemunoz/.ih35-gate.env", "scripts/verify-overpayment-becomes-unapplied-credit.mjs"]);
    ctx.run("node", ["--env-file=/Users/jorgemunoz/.ih35-gate.env", "scripts/verify-overpayment-becomes-unapplied-credit.mjs", "--selftest"]);
  },
};
