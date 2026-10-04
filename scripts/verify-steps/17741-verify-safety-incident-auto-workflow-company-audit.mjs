export default {
  name: "verify:safety-incident-auto-workflow-company-audit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-incident-auto-workflow-company-audit.mjs"]);
  },
};
