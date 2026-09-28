export default {
  name: "verify-banking-filters-and-reconcile-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-filters-and-reconcile-complete.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-filters-and-reconcile-complete.mjs"]);
  },
};
