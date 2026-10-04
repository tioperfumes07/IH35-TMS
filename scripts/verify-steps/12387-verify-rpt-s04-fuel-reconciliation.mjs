export default {
  name: "verify:rpt-s04-fuel-reconciliation",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rpt-s04-fuel-reconciliation.mjs"]);
  },
};
