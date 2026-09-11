export default {
  name: "verify:reg030-bofa-usmca-freight-reconciliation",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reg030-bofa-usmca-freight-reconciliation.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reg030-bofa-usmca-freight-reconciliation.mjs"]);
  },
};
