export default {
  name: "verify:audit-wo-qbo-reconcile-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-wo-qbo-reconcile-human-labels.mjs"]);
  },
};
