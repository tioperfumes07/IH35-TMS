export default {
  name: "verify:dispatch-auto-status-audit-failure-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-auto-status-audit-failure-honesty.mjs"]);
  },
};
