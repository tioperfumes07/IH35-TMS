export default {
  name: "verify:qbo-reconcile-captures-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-reconcile-captures-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-reconcile-captures-page-uses-paritytable.mjs"]);
  },
};
