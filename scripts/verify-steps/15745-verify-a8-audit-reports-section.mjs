export default {
  name: "verify:a8-audit-reports-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-a8-audit-reports-section.mjs"]);
  },
};
