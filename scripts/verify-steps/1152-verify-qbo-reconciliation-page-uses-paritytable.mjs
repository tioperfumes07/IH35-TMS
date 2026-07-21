export default {
  name: "verify:qbo-reconciliation-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-reconciliation-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-reconciliation-page-uses-paritytable.mjs"]);
  },
};
