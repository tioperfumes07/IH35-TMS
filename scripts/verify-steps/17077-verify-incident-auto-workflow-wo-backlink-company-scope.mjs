export default {
  name: "verify:incident-auto-workflow-wo-backlink-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-incident-auto-workflow-wo-backlink-company-scope.mjs"]);
  },
};
