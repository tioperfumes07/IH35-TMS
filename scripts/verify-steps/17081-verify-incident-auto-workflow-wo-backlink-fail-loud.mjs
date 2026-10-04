export default {
  name: "verify:incident-auto-workflow-wo-backlink-fail-loud",
  run(ctx) {
    ctx.run("node", ["scripts/verify-incident-auto-workflow-wo-backlink-fail-loud.mjs"]);
  },
};
