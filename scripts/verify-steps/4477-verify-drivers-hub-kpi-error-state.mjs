export default {
  name: "verify:drivers-hub-kpi-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-hub-kpi-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-drivers-hub-kpi-error-state.mjs"]);
  },
};
