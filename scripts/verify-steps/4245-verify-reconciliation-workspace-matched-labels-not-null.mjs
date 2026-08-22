export default {
  name: "verify:reconciliation-workspace-matched-labels-not-null",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reconciliation-workspace-matched-labels-not-null.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reconciliation-workspace-matched-labels-not-null.mjs"]);
  },
};
