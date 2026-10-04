export default {
  name: "verify:dispatch-overview-dashboard-error",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-overview-dashboard-error.mjs"]);
  },
};
