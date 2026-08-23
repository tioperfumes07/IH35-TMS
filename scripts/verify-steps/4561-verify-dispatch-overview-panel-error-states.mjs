export default {
  name: "verify:dispatch-overview-panel-error-states",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-overview-panel-error-states.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-overview-panel-error-states.mjs"]);
  },
};
