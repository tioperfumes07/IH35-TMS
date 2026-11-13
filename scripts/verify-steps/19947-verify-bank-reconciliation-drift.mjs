export default {
  name: "verify:verify-bank-reconciliation-drift",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-reconciliation-drift.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-reconciliation-drift.mjs"]);
  },
};
