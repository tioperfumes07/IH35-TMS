export default {
  name: "verify:legal-deadline-alerts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-deadline-alerts.mjs"]);
  },
};
