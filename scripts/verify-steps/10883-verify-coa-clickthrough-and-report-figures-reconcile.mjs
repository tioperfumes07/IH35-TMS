export default {
  name: "verify:coa-clickthrough-and-report-figures-reconcile",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-clickthrough-and-report-figures-reconcile.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-coa-clickthrough-and-report-figures-reconcile.mjs"]);
  },
};
